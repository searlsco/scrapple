import Database from 'better-sqlite3';
import { ManifestRow } from '../db.js';
interface GlobalOptions {
    human?: boolean;
}
export declare const FETCHABLE_RESOURCE_STATUSES: readonly ["discovered", "failed"];
export declare function resourceForFetch(resource: ManifestRow): ManifestRow;
export declare function shouldLogFetchProgress(processed: number, total: number, now: number, lastLoggedAt: number): boolean;
export declare function fetchResources(db: Database.Database, global: GlobalOptions): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map