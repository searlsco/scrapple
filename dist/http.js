import { createHash } from 'node:crypto';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
function isRetryableError(error) {
    if (!(error instanceof Error))
        return false;
    const cause = error.cause;
    const message = cause?.message || error.message || '';
    // Redirect loops are not retryable
    if (message.includes('redirect count exceeded'))
        return false;
    // Network errors are generally retryable
    if (error.name === 'TypeError' && error.message === 'fetch failed')
        return true;
    if (message.includes('ECONNRESET'))
        return true;
    if (message.includes('ETIMEDOUT'))
        return true;
    if (message.includes('ENOTFOUND'))
        return true;
    if (message.includes('socket hang up'))
        return true;
    return false;
}
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export async function fetchWithCache(url, etag, lastModified, maxRetries = DEFAULT_MAX_RETRIES) {
    const headers = {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/html, */*',
    };
    if (etag) {
        headers['If-None-Match'] = etag;
    }
    if (lastModified) {
        headers['If-Modified-Since'] = lastModified;
    }
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { headers });
            if (response.status === 304) {
                // Not modified
                return null;
            }
            const data = await response.text();
            const contentHash = createHash('sha256').update(data).digest('hex');
            return {
                ok: response.ok,
                status: response.status,
                etag: response.headers.get('etag') || undefined,
                lastModified: response.headers.get('last-modified') || undefined,
                contentHash,
                data,
            };
        }
        catch (error) {
            lastError = error;
            if (!isRetryableError(error) || attempt === maxRetries) {
                // Return a failed result for non-retryable errors instead of throwing
                return {
                    ok: false,
                    status: 0,
                    contentHash: '',
                    data: '',
                };
            }
            const delay = DEFAULT_BASE_DELAY_MS * Math.pow(2, attempt);
            await sleep(delay);
        }
    }
    // Should not reach here, but return failed result if we do
    return {
        ok: false,
        status: 0,
        contentHash: '',
        data: '',
    };
}
export function urlToId(url) {
    return createHash('sha256').update(url).digest('hex').slice(0, 16);
}
export async function fetchBinary(url, maxRetries = DEFAULT_MAX_RETRIES) {
    const headers = {
        'User-Agent': USER_AGENT,
    };
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                return {
                    ok: false,
                    status: response.status,
                    contentHash: '',
                    data: Buffer.alloc(0),
                };
            }
            const arrayBuffer = await response.arrayBuffer();
            const data = Buffer.from(arrayBuffer);
            const contentHash = createHash('sha256').update(data).digest('hex');
            return {
                ok: true,
                status: response.status,
                etag: response.headers.get('etag') || undefined,
                lastModified: response.headers.get('last-modified') || undefined,
                contentHash,
                data,
            };
        }
        catch (error) {
            if (!isRetryableError(error) || attempt === maxRetries) {
                return {
                    ok: false,
                    status: 0,
                    contentHash: '',
                    data: Buffer.alloc(0),
                };
            }
            const delay = DEFAULT_BASE_DELAY_MS * Math.pow(2, attempt);
            await sleep(delay);
        }
    }
    return {
        ok: false,
        status: 0,
        contentHash: '',
        data: Buffer.alloc(0),
    };
}
//# sourceMappingURL=http.js.map