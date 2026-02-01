import { describe, it } from 'node:test';
import assert from 'node:assert';
// Test the normalization helpers directly
// These are internal functions, so we recreate them here for testing
function extractTextFromHtml(html) {
    if (!html)
        return null;
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.trim();
    return text || null;
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
        return '';
    })
        .join('');
}
describe('HTML text extraction', () => {
    it('removes script tags', () => {
        const html = '<p>Hello</p><script>alert("bad")</script><p>World</p>';
        const result = extractTextFromHtml(html);
        assert.ok(!result?.includes('alert'));
        assert.ok(result?.includes('Hello'));
        assert.ok(result?.includes('World'));
    });
    it('removes style tags', () => {
        const html = '<p>Content</p><style>.foo { color: red; }</style>';
        const result = extractTextFromHtml(html);
        assert.ok(!result?.includes('color'));
        assert.ok(result?.includes('Content'));
    });
    it('converts headings to markdown', () => {
        const html = '<h1>Title</h1><h2>Subtitle</h2>';
        const result = extractTextFromHtml(html);
        assert.ok(result?.includes('# Title'));
        assert.ok(result?.includes('## Subtitle'));
    });
    it('converts list items to markdown', () => {
        const html = '<ul><li>First</li><li>Second</li></ul>';
        const result = extractTextFromHtml(html);
        assert.ok(result?.includes('- First'));
        assert.ok(result?.includes('- Second'));
    });
    it('decodes HTML entities', () => {
        const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot;</p>';
        const result = extractTextFromHtml(html);
        assert.ok(result?.includes('A & B < C > D "E"'));
    });
    it('returns null for empty input', () => {
        assert.strictEqual(extractTextFromHtml(''), null);
    });
});
describe('Apple JSON inline content extraction', () => {
    it('extracts text nodes', () => {
        const content = [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'World' },
        ];
        const result = extractTextFromInlineContent(content);
        assert.strictEqual(result, 'Hello World');
    });
    it('formats code voice as inline code', () => {
        const content = [
            { type: 'text', text: 'Use ' },
            { type: 'codeVoice', code: 'SwiftUI' },
            { type: 'text', text: ' for UI' },
        ];
        const result = extractTextFromInlineContent(content);
        assert.strictEqual(result, 'Use `SwiftUI` for UI');
    });
    it('extracts reference identifiers', () => {
        const content = [
            { type: 'text', text: 'See ' },
            { type: 'reference', identifier: 'doc://com.apple/documentation/SwiftUI/View' },
        ];
        const result = extractTextFromInlineContent(content);
        assert.strictEqual(result, 'See View');
    });
    it('handles empty arrays', () => {
        const result = extractTextFromInlineContent([]);
        assert.strictEqual(result, '');
    });
    it('ignores unknown types', () => {
        const content = [
            { type: 'text', text: 'Known' },
            { type: 'unknown', data: 'ignored' },
        ];
        const result = extractTextFromInlineContent(content);
        assert.strictEqual(result, 'Known');
    });
});
//# sourceMappingURL=normalize.test.js.map