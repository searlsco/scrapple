import Database from 'better-sqlite3';
interface GlobalOptions {
    human?: boolean;
}
export declare const FETCHABLE_RESOURCE_STATUSES: readonly ["discovered", "failed"];
export declare function shouldLogFetchProgress(processed: number, total: number, now: number, lastLoggedAt: number): boolean;
export declare function fetchResources(db: Database.Database, global: GlobalOptions): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map