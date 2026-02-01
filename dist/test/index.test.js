import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { paths } from '../paths.js';
import { getCodeFileNormalizedPath } from '../index/index.js';
// Test content chunking logic
const MAX_CHUNK_SIZE = 10000;
function findBreakPoint(text, maxLength) {
    const paragraphBreak = text.lastIndexOf('\n\n', maxLength);
    if (paragraphBreak > maxLength * 0.5) {
        return paragraphBreak + 2;
    }
    const lineBreak = text.lastIndexOf('\n', maxLength);
    if (lineBreak > maxLength * 0.5) {
        return lineBreak + 1;
    }
    const sentenceBreak = Math.max(text.lastIndexOf('. ', maxLength), text.lastIndexOf('! ', maxLength), text.lastIndexOf('? ', maxLength));
    if (sentenceBreak > maxLength * 0.5) {
        return sentenceBreak + 2;
    }
    const wordBreak = text.lastIndexOf(' ', maxLength);
    if (wordBreak > maxLength * 0.5) {
        return wordBreak + 1;
    }
    return maxLength;
}
function chunkContent(content) {
    if (content.length <= MAX_CHUNK_SIZE) {
        return [content];
    }
    const chunks = [];
    let remaining = content;
    while (remaining.length > 0) {
        if (remaining.length <= MAX_CHUNK_SIZE) {
            chunks.push(remaining);
            break;
        }
        const breakPoint = findBreakPoint(remaining, MAX_CHUNK_SIZE);
        chunks.push(remaining.slice(0, breakPoint).trim());
        remaining = remaining.slice(breakPoint).trim();
    }
    return chunks;
}
describe('Content chunking', () => {
    it('returns single chunk for small content', () => {
        const content = 'Small content';
        const chunks = chunkContent(content);
        assert.strictEqual(chunks.length, 1);
        assert.strictEqual(chunks[0], content);
    });
    it('chunks at paragraph boundaries when possible', () => {
        const para1 = 'a'.repeat(6000);
        const para2 = 'b'.repeat(6000);
        const content = `${para1}\n\n${para2}`;
        const chunks = chunkContent(content);
        assert.strictEqual(chunks.length, 2);
        assert.strictEqual(chunks[0], para1);
        assert.strictEqual(chunks[1], para2);
    });
    it('chunks at sentence boundaries when no paragraph break', () => {
        const sentence1 = 'a'.repeat(6000) + '.';
        const sentence2 = 'b'.repeat(6000);
        const content = `${sentence1} ${sentence2}`;
        const chunks = chunkContent(content);
        assert.strictEqual(chunks.length, 2);
        assert.ok(chunks[0].endsWith('.'));
    });
    it('chunks at word boundaries as fallback', () => {
        const word1 = 'a'.repeat(6000);
        const word2 = 'b'.repeat(6000);
        const content = `${word1} ${word2}`;
        const chunks = chunkContent(content);
        assert.strictEqual(chunks.length, 2);
        // Should not break in middle of "words"
        assert.ok(!chunks[0].includes('b'));
        assert.ok(!chunks[1].includes('a'));
    });
    it('preserves all content across chunks', () => {
        const content = 'word '.repeat(3000); // ~15000 chars
        const chunks = chunkContent(content);
        const rejoined = chunks.join(' ');
        // Account for trimming
        assert.ok(rejoined.length >= content.trim().length - chunks.length);
    });
});
describe('Break point finding', () => {
    it('prefers paragraph breaks', () => {
        const text = 'First paragraph.\n\nSecond paragraph. More text here.';
        const breakPoint = findBreakPoint(text, 30);
        assert.strictEqual(breakPoint, text.indexOf('\n\n') + 2);
    });
    it('falls back to line breaks', () => {
        const text = 'First line.\nSecond line. More.';
        const breakPoint = findBreakPoint(text, 20);
        assert.strictEqual(breakPoint, text.indexOf('\n') + 1);
    });
    it('falls back to sentence breaks', () => {
        const text = 'First sentence. Second sentence.';
        const breakPoint = findBreakPoint(text, 20);
        assert.strictEqual(breakPoint, text.indexOf('. ') + 2);
    });
    it('falls back to word breaks', () => {
        const text = 'oneword anotherword';
        const breakPoint = findBreakPoint(text, 12);
        assert.strictEqual(breakPoint, text.indexOf(' ') + 1);
    });
    it('hard breaks at max when no good break point', () => {
        const text = 'a'.repeat(100);
        const breakPoint = findBreakPoint(text, 50);
        assert.strictEqual(breakPoint, 50);
    });
});
describe('Code file path resolution', () => {
    it('extracts sample ID and path from code_file URL', () => {
        const sampleUrl = 'https://docs-assets.developer.apple.com/published/15035f283d6a/FrutaBuildingAFeatureRichAppWithSwiftUI.zip';
        const filePath = 'Shared/Model/Smoothie.swift';
        const codeFileUrl = `${sampleUrl}#${filePath}`;
        const expectedSampleId = createHash('sha256').update(sampleUrl).digest('hex').slice(0, 16);
        const expectedPath = join(paths.data.normalized.samples, expectedSampleId, filePath);
        const result = getCodeFileNormalizedPath(codeFileUrl);
        assert.strictEqual(result, expectedPath);
    });
    it('handles paths with special characters', () => {
        const sampleUrl = 'https://docs-assets.developer.apple.com/published/abc123/Sample.zip';
        const filePath = 'Sources/Views/My View.swift';
        const codeFileUrl = `${sampleUrl}#${filePath}`;
        const expectedSampleId = createHash('sha256').update(sampleUrl).digest('hex').slice(0, 16);
        const expectedPath = join(paths.data.normalized.samples, expectedSampleId, filePath);
        const result = getCodeFileNormalizedPath(codeFileUrl);
        assert.strictEqual(result, expectedPath);
    });
    it('returns empty string for URLs without fragment', () => {
        const url = 'https://example.com/sample.zip';
        const result = getCodeFileNormalizedPath(url);
        assert.strictEqual(result, '');
    });
});
//# sourceMappingURL=index.test.js.map