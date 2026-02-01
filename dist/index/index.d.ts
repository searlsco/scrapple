import Database from 'better-sqlite3';
interface GlobalOptions {
    human?: boolean;
}
export declare function indexResources(db: Database.Database, global: GlobalOptions): Promise<void>;
/**
 * Parses a code_file URL (e.g., "https://...zip#path/to/file.swift")
 * and returns the normalized path where the file was extracted.
 */
export declare function getCodeFileNormalizedPath(url: string): string;
export declare function embedContent(db: Database.Database, global: GlobalOptions): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map