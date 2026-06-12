import Database from 'better-sqlite3';
import { ManifestRow } from '../db.js';
interface GlobalOptions {
    human?: boolean;
}
export declare function normalizeResources(db: Database.Database, global: GlobalOptions): Promise<void>;
export declare function normalizeSampleArchive(resource: ManifestRow, rawContent: Buffer, db: Database.Database): boolean;
export {};
//# sourceMappingURL=index.d.ts.map