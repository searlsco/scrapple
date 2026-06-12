interface GlobalOptions {
    human?: boolean;
}
interface PruneOptions {
    dryRun?: boolean;
    rawSamplesDir?: string;
}
export interface PruneResult {
    filesDeleted: number;
    bytesDeleted: number;
    dryRun: boolean;
}
export declare function prune(options: PruneOptions, global: GlobalOptions): Promise<void>;
export declare function pruneRawSamples(options?: PruneOptions): PruneResult;
export {};
//# sourceMappingURL=prune.d.ts.map