import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneRawSamples } from '../commands/prune.js';
function withTempDir(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'scrapple-prune-test-'));
    try {
        fn(dir);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
describe('pruneRawSamples', () => {
    it('deletes raw sample archives and reports reclaimed bytes', () => {
        withTempDir((dir) => {
            const first = join(dir, 'sample-one');
            const second = join(dir, 'sample-two.zip');
            writeFileSync(first, Buffer.alloc(12));
            writeFileSync(second, Buffer.alloc(30));
            const result = pruneRawSamples({ rawSamplesDir: dir });
            assert.deepStrictEqual(result, {
                filesDeleted: 2,
                bytesDeleted: 42,
                dryRun: false,
            });
            assert.strictEqual(existsSync(first), false);
            assert.strictEqual(existsSync(second), false);
            assert.strictEqual(existsSync(dir), true);
        });
    });
    it('reports matching files without deleting during a dry run', () => {
        withTempDir((dir) => {
            const archive = join(dir, 'sample.zip');
            writeFileSync(archive, Buffer.alloc(8));
            const result = pruneRawSamples({ rawSamplesDir: dir, dryRun: true });
            assert.deepStrictEqual(result, {
                filesDeleted: 1,
                bytesDeleted: 8,
                dryRun: true,
            });
            assert.strictEqual(existsSync(archive), true);
        });
    });
});
//# sourceMappingURL=prune.test.js.map