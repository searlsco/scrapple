import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FETCHABLE_RESOURCE_STATUSES, shouldLogFetchProgress, } from '../fetch/index.js';
import { WWDC_NAVIGATION_WAIT_UNTIL } from '../fetch/playwright.js';
describe('WWDC Playwright navigation', () => {
    it('does not wait for network idle on Apple video pages', () => {
        assert.strictEqual(WWDC_NAVIGATION_WAIT_UNTIL, 'load');
    });
});
describe('fetch progress logging', () => {
    it('logs the first processed resource', () => {
        assert.strictEqual(shouldLogFetchProgress(1, 500, 1_000, 1_000), true);
    });
    it('logs every 100 processed resources', () => {
        assert.strictEqual(shouldLogFetchProgress(100, 500, 1_000, 1_000), true);
    });
    it('logs when 10 seconds pass without an item interval', () => {
        assert.strictEqual(shouldLogFetchProgress(37, 500, 11_000, 1_000), true);
    });
    it('logs completion', () => {
        assert.strictEqual(shouldLogFetchProgress(500, 500, 1_000, 1_000), true);
    });
    it('skips ordinary intermediate resources', () => {
        assert.strictEqual(shouldLogFetchProgress(37, 500, 5_000, 1_000), false);
    });
    it('skips empty fetch sets', () => {
        assert.strictEqual(shouldLogFetchProgress(0, 0, 11_000, 1_000), false);
    });
});
describe('fetchable resource statuses', () => {
    it('retries failed resources on later fetch runs', () => {
        assert.deepStrictEqual(FETCHABLE_RESOURCE_STATUSES, ['discovered', 'failed']);
    });
    it('does not refetch resources that already moved past fetch', () => {
        const statuses = FETCHABLE_RESOURCE_STATUSES;
        assert.strictEqual(statuses.includes('fetched'), false);
        assert.strictEqual(statuses.includes('normalized'), false);
        assert.strictEqual(statuses.includes('indexed'), false);
    });
});
//# sourceMappingURL=fetch.test.js.map