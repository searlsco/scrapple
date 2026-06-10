import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { paths } from '../paths.js';
// Source file extensions to extract from samples
const SOURCE_EXTENSIONS = new Set([
    '.swift',
    '.m',
    '.mm',
    '.h',
    '.c',
    '.cpp',
    '.metal',
    '.strings',
    '.plist',
    '.json',
    '.xml',
    '.storyboard',
    '.xib',
]);
export async function normalizeResources(db, global) {
    const log = (msg) => {
        if (global.human)
            console.log(`  ${msg}`);
    };
    // Get all fetched resources that need normalization
    const toNormalize = db
        .prepare(`
      SELECT * FROM manifest
      WHERE status = 'fetched'
    `)
        .all();
    const total = toNormalize.length;
    log(`Normalizing ${total} resources...`);
    const updateManifest = db.prepare(`
    UPDATE manifest SET status = ? WHERE id = ?
  `);
    let normalized = 0;
    let failed = 0;
    for (const resource of toNormalize) {
        try {
            const rawPath = getRawPath(resource.type, resource.id);
            if (!existsSync(rawPath)) {
                updateManifest.run('failed', resource.id);
                failed++;
                continue;
            }
            const rawContent = resource.type === 'sample'
                ? readFileSync(rawPath) // Read as buffer for ZIPs
                : readFileSync(rawPath, 'utf-8');
            const normalizedContent = normalizeContent(resource, rawContent, db);
            if (normalizedContent) {
                const normalizedPath = getNormalizedPath(resource.type, resource.id);
                mkdirSync(dirname(normalizedPath), { recursive: true });
                writeFileSync(normalizedPath, normalizedContent);
                updateManifest.run('normalized', resource.id);
                normalized++;
            }
            else {
                updateManifest.run('failed', resource.id);
                failed++;
            }
        }
        catch {
            updateManifest.run('failed', resource.id);
            failed++;
        }
        // Progress logging
        const processed = normalized + failed;
        if (processed % 50 === 0 || processed === total) {
            log(`  Progress: ${processed}/${total} (${normalized} normalized, ${failed} failed)`);
        }
    }
    log(`Normalize complete: ${normalized} normalized, ${failed} failed`);
}
function normalizeContent(resource, rawContent, db) {
    switch (resource.type) {
        case 'doc':
            return normalizeDoc(resource, rawContent);
        case 'talk':
            return normalizeTalk(resource, rawContent);
        case 'sample':
            return normalizeSample(resource, rawContent, db);
        default:
            return typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
    }
}
function normalizeDoc(resource, rawContent) {
    try {
        const data = JSON.parse(rawContent);
        return jsonDocToMarkdown(data, resource);
    }
    catch {
        // Not JSON, return as-is or extract text from HTML
        return extractTextFromHtml(rawContent);
    }
}
function normalizeTalk(resource, rawContent) {
    // Try to parse as JSON (new Playwright format)
    try {
        const data = JSON.parse(rawContent);
        const title = data.title || resource.title || 'Untitled Session';
        const parts = [];
        parts.push(`# ${title}`);
        parts.push(`\nURL: ${resource.url}\n`);
        if (data.description) {
            parts.push(`## Description\n\n${data.description}\n`);
        }
        if (data.transcript) {
            parts.push(`## Transcript\n\n${data.transcript}\n`);
        }
        if (data.resources && data.resources.length > 0) {
            parts.push(`## Resources\n`);
            for (const r of data.resources) {
                parts.push(`- ${r}`);
            }
        }
        return parts.join('\n');
    }
    catch {
        // Fallback for old HTML format
        const transcript = extractTranscript(rawContent);
        const title = resource.title || 'Untitled Session';
        let md = `# ${title}\n\n`;
        md += `URL: ${resource.url}\n\n`;
        if (transcript) {
            md += `## Transcript\n\n${transcript}\n`;
        }
        else {
            const text = extractTextFromHtml(rawContent);
            if (text) {
                md += `## Content\n\n${text}\n`;
            }
        }
        return md;
    }
}
function normalizeSample(resource, rawContent, db) {
    // Handle ZIP files
    if (resource.url.endsWith('.zip')) {
        return extractAndIndexZip(resource, rawContent, db);
    }
    // Non-ZIP sample pages (shouldn't happen with new flow)
    const text = extractTextFromHtml(rawContent.toString('utf-8'));
    const title = resource.title || 'Sample Code';
    let md = `# ${title}\n\n`;
    md += `URL: ${resource.url}\n\n`;
    if (text) {
        md += text;
    }
    return md;
}
function extractAndIndexZip(resource, zipBuffer, db) {
    try {
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries();
        const title = resource.title || 'Sample Code';
        const insertCodeFile = db.prepare(`
      INSERT OR IGNORE INTO manifest (id, type, url, source, status, title)
      VALUES (?, 'code_file', ?, 'sample-extract', 'normalized', ?)
    `);
        const sourceFiles = [];
        for (const entry of entries) {
            if (entry.isDirectory)
                continue;
            const ext = extname(entry.entryName).toLowerCase();
            if (!SOURCE_EXTENSIONS.has(ext))
                continue;
            // Skip hidden files and build artifacts
            const name = basename(entry.entryName);
            if (name.startsWith('.'))
                continue;
            if (entry.entryName.includes('/.build/'))
                continue;
            if (entry.entryName.includes('/DerivedData/'))
                continue;
            if (entry.entryName.includes('/Pods/'))
                continue;
            try {
                const content = entry.getData().toString('utf-8');
                // Create a unique ID for this code file
                const fileUrl = `${resource.url}#${entry.entryName}`;
                const fileId = createHash('sha256').update(fileUrl).digest('hex').slice(0, 16);
                // Save the source file
                const normalizedPath = join(paths.data.normalized.samples, resource.id, entry.entryName);
                mkdirSync(dirname(normalizedPath), { recursive: true });
                writeFileSync(normalizedPath, content);
                // Add to manifest
                insertCodeFile.run(fileId, fileUrl, `${title} - ${name}`);
                sourceFiles.push({ path: entry.entryName, content });
            }
            catch {
                // Skip files that can't be read as UTF-8
            }
        }
        // Create a summary markdown for the sample
        let md = `# ${title}\n\n`;
        md += `URL: ${resource.url}\n\n`;
        md += `## Source Files (${sourceFiles.length})\n\n`;
        for (const file of sourceFiles) {
            md += `### ${file.path}\n\n`;
            md += `\`\`\`${getLanguageFromExt(extname(file.path))}\n`;
            // Truncate very long files
            const truncated = file.content.length > 5000
                ? file.content.slice(0, 5000) + '\n// ... (truncated)'
                : file.content;
            md += truncated;
            md += '\n```\n\n';
        }
        return md;
    }
    catch {
        // ZIP extraction failed
        return null;
    }
}
function getLanguageFromExt(ext) {
    const map = {
        '.swift': 'swift',
        '.m': 'objc',
        '.mm': 'objc',
        '.h': 'objc',
        '.c': 'c',
        '.cpp': 'cpp',
        '.metal': 'metal',
        '.json': 'json',
        '.xml': 'xml',
        '.plist': 'xml',
    };
    return map[ext.toLowerCase()] || '';
}
function jsonDocToMarkdown(data, resource) {
    if (!data || typeof data !== 'object') {
        return `# ${resource.title || 'Document'}\n\nNo content available.`;
    }
    const obj = data;
    const parts = [];
    // Extract title
    const title = extractTitle(obj) || resource.title || 'Document';
    parts.push(`# ${title}\n`);
    // Extract abstract/summary
    const abstract = extractAbstract(obj);
    if (abstract) {
        parts.push(`${abstract}\n`);
    }
    // Extract main content
    const content = extractContent(obj);
    if (content) {
        parts.push(content);
    }
    // Add URL reference
    parts.push(`\n---\nSource: ${resource.url}`);
    return parts.join('\n');
}
function extractTitle(data) {
    if (typeof data.title === 'string')
        return data.title;
    if (data.metadata && typeof data.metadata === 'object') {
        const meta = data.metadata;
        if (typeof meta.title === 'string')
            return meta.title;
    }
    return null;
}
function extractAbstract(data) {
    if (data.abstract && Array.isArray(data.abstract)) {
        return extractTextFromInlineContent(data.abstract);
    }
    if (data.metadata && typeof data.metadata === 'object') {
        const meta = data.metadata;
        if (meta.abstract && Array.isArray(meta.abstract)) {
            return extractTextFromInlineContent(meta.abstract);
        }
    }
    return null;
}
function extractContent(data) {
    const parts = [];
    // Primary content sections
    if (data.primaryContentSections && Array.isArray(data.primaryContentSections)) {
        for (const section of data.primaryContentSections) {
            const sectionText = extractSectionContent(section);
            if (sectionText)
                parts.push(sectionText);
        }
    }
    // Topics
    if (data.topicSections && Array.isArray(data.topicSections)) {
        for (const topic of data.topicSections) {
            if (topic && typeof topic === 'object') {
                const t = topic;
                if (typeof t.title === 'string') {
                    parts.push(`\n## ${t.title}\n`);
                }
                if (Array.isArray(t.identifiers)) {
                    for (const id of t.identifiers) {
                        if (typeof id === 'string') {
                            parts.push(`- ${id}`);
                        }
                    }
                }
            }
        }
    }
    // See also
    if (data.seeAlsoSections && Array.isArray(data.seeAlsoSections)) {
        parts.push('\n## See Also\n');
        for (const section of data.seeAlsoSections) {
            if (section && typeof section === 'object') {
                const s = section;
                if (Array.isArray(s.identifiers)) {
                    for (const id of s.identifiers) {
                        if (typeof id === 'string') {
                            parts.push(`- ${id}`);
                        }
                    }
                }
            }
        }
    }
    return parts.length > 0 ? parts.join('\n') : null;
}
function extractSectionContent(section) {
    if (!section || typeof section !== 'object')
        return null;
    const s = section;
    const parts = [];
    if (typeof s.kind === 'string') {
        // Different section types
        if (s.kind === 'content' && Array.isArray(s.content)) {
            for (const item of s.content) {
                const text = extractContentItem(item);
                if (text)
                    parts.push(text);
            }
        }
        else if (s.kind === 'declarations' && Array.isArray(s.declarations)) {
            parts.push('\n### Declaration\n');
            for (const decl of s.declarations) {
                if (decl && typeof decl === 'object') {
                    const d = decl;
                    if (Array.isArray(d.tokens)) {
                        const code = d.tokens
                            .map((t) => (t && typeof t === 'object' && 'text' in t ? t.text : ''))
                            .join('');
                        parts.push(`\`\`\`\n${code}\n\`\`\``);
                    }
                }
            }
        }
        else if (s.kind === 'parameters' && Array.isArray(s.parameters)) {
            parts.push('\n### Parameters\n');
            for (const param of s.parameters) {
                if (param && typeof param === 'object') {
                    const p = param;
                    const name = typeof p.name === 'string' ? p.name : 'unknown';
                    const content = Array.isArray(p.content) ? extractTextFromInlineContent(p.content) : '';
                    parts.push(`- **${name}**: ${content}`);
                }
            }
        }
    }
    return parts.length > 0 ? parts.join('\n') : null;
}
function extractContentItem(item) {
    if (!item || typeof item !== 'object')
        return null;
    const i = item;
    if (i.type === 'paragraph' && Array.isArray(i.inlineContent)) {
        return extractTextFromInlineContent(i.inlineContent);
    }
    if (i.type === 'heading' && Array.isArray(i.inlineContent)) {
        const level = typeof i.level === 'number' ? i.level : 2;
        const text = extractTextFromInlineContent(i.inlineContent);
        return `${'#'.repeat(level)} ${text}`;
    }
    if (i.type === 'codeListing') {
        const code = Array.isArray(i.code) ? i.code.join('\n') : '';
        const lang = typeof i.syntax === 'string' ? i.syntax : '';
        return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    if (i.type === 'unorderedList' && Array.isArray(i.items)) {
        return i.items
            .map((li) => {
            if (li && typeof li === 'object' && 'content' in li && Array.isArray(li.content)) {
                const content = li.content;
                return `- ${content.map(c => extractContentItem(c)).filter(Boolean).join(' ')}`;
            }
            return null;
        })
            .filter(Boolean)
            .join('\n');
    }
    return null;
}
function extractTextFromInlineContent(content) {
    return content
        .map((item) => {
        if (!item || typeof item !== 'object')
            return '';
        const i = item;
        if (i.type === 'text' && typeof i.text === 'string') {
            return i.text;
        }
        if (i.type === 'codeVoice' && typeof i.code === 'string') {
            return `\`${i.code}\``;
        }
        if (i.type === 'reference' && typeof i.identifier === 'string') {
            return i.identifier.split('/').pop() || '';
        }
        if (i.type === 'emphasis' && Array.isArray(i.inlineContent)) {
            return `*${extractTextFromInlineContent(i.inlineContent)}*`;
        }
        if (i.type === 'strong' && Array.isArray(i.inlineContent)) {
            return `**${extractTextFromInlineContent(i.inlineContent)}**`;
        }
        return '';
    })
        .join('');
}
function extractTranscript(html) {
    // Look for transcript data in WWDC pages
    // Transcripts are often in a data attribute or script tag
    // Try to find transcript in JSON data
    const jsonMatch = html.match(/transcript['"]\s*:\s*(\[[^\]]+\])/i);
    if (jsonMatch) {
        try {
            const segments = JSON.parse(jsonMatch[1]);
            if (Array.isArray(segments)) {
                return segments
                    .map((s) => {
                    if (s && typeof s === 'object' && 'text' in s) {
                        return s.text;
                    }
                    return '';
                })
                    .filter(Boolean)
                    .join(' ');
            }
        }
        catch {
            // Ignore parse errors
        }
    }
    // Look for transcript section in HTML
    const transcriptMatch = html.match(/<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (transcriptMatch) {
        return extractTextFromHtml(transcriptMatch[1]);
    }
    return null;
}
function extractTextFromHtml(html) {
    if (!html)
        return null;
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Convert some tags to markdown
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Remove remaining tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    // Clean up whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.trim();
    return text || null;
}
function getRawPath(type, id) {
    switch (type) {
        case 'doc':
            return join(paths.data.raw.docs, `${id}.json`);
        case 'talk':
            return join(paths.data.raw.videos, `${id}.json`);
        case 'sample':
            return join(paths.data.raw.samples, `${id}.zip`);
        case 'code_file':
            return join(paths.data.raw.samples, id);
        default:
            return join(paths.data.raw.dir, id);
    }
}
function getNormalizedPath(type, id) {
    switch (type) {
        case 'doc':
            return join(paths.data.normalized.docs, `${id}.md`);
        case 'talk':
            return join(paths.data.normalized.transcripts, `${id}.txt`);
        case 'sample':
            return join(paths.data.normalized.samples, `${id}.md`);
        case 'code_file':
            return join(paths.data.normalized.samples, id);
        default:
            return join(paths.data.normalized.dir, id);
    }
}
//# sourceMappingURL=index.js.map