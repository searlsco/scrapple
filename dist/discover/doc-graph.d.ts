import Database from 'better-sqlite3';
interface DocGraphOptions {
    human?: boolean;
    log?: (message: string) => void;
    progressEvery?: number;
    now?: () => number;
}
export declare function discoverDocGraph(db: Database.Database, options?: DocGraphOptions): Promise<number>;
export {};
//# sourceMappingURL=doc-graph.d.ts.map