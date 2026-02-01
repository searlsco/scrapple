interface SearchOptions {
    type?: string;
    limit: string;
    keywordOnly?: boolean;
    semanticOnly?: boolean;
}
interface GlobalOptions {
    human?: boolean;
}
export declare function search(query: string, options: SearchOptions, global: GlobalOptions): Promise<void>;
export {};
//# sourceMappingURL=search.d.ts.map