import { Browser } from 'playwright';
export declare function getBrowser(): Promise<Browser>;
export declare function closeBrowser(): Promise<void>;
export declare function fetchWWDCBatch(urls: string[], onProgress?: (completed: number, total: number) => void): Promise<Map<string, WWDCContent | null>>;
export interface WWDCContent {
    title: string;
    transcript: string;
    description: string;
    resources: string[];
}
export declare function fetchWWDCWithPlaywright(url: string): Promise<WWDCContent | null>;
//# sourceMappingURL=playwright.d.ts.map