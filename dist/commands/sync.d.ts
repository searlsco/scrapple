interface SyncOptions {
    discoverOnly?: boolean;
    fetchOnly?: boolean;
    normalizeOnly?: boolean;
    indexOnly?: boolean;
    refreshAll?: boolean;
}
interface GlobalOptions {
    human?: boolean;
}
export declare function sync(options: SyncOptions, global: GlobalOptions): Promise<void>;
export {};
//# sourceMappingURL=sync.d.ts.map