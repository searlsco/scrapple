export interface FetchResult {
    ok: boolean;
    status: number;
    etag?: string;
    lastModified?: string;
    contentHash: string;
    data: string;
}
export declare function fetchWithCache(url: string, etag?: string | null, lastModified?: string | null, maxRetries?: number): Promise<FetchResult | null>;
export declare function urlToId(url: string): string;
export interface BinaryFetchResult {
    ok: boolean;
    status: number;
    etag?: string;
    lastModified?: string;
    contentHash: string;
    data: Buffer;
}
export declare function fetchBinary(url: string, maxRetries?: number): Promise<BinaryFetchResult>;
//# sourceMappingURL=http.d.ts.map