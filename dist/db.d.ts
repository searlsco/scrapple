import Database from 'better-sqlite3';
export type ResourceType = 'doc' | 'talk' | 'sample' | 'code_file';
export type ResourceStatus = 'discovered' | 'fetched' | 'normalized' | 'indexed' | 'failed';
export interface ManifestRow {
    id: string;
    type: ResourceType;
    url: string;
    source: string;
    status: ResourceStatus;
    etag: string | null;
    last_modified: string | null;
    fetched_at: number | null;
    content_hash: string | null;
    title: string | null;
    platforms: string | null;
}
export interface ContentRow {
    id: string;
    chunk_index: number;
    title: string;
    body: string;
    type: ResourceType;
    platforms: string | null;
    url: string;
    local_path: string;
}
export declare function getDb(): Database.Database;
export declare function closeDb(): void;
//# sourceMappingURL=db.d.ts.map