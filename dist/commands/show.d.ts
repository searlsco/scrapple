import { getDb, ManifestRow } from '../db.js';
interface GlobalOptions {
    human?: boolean;
}
export interface Breadcrumb {
    name: string;
    path: string;
}
/**
 * Build breadcrumbs from a documentation URL.
 * e.g., /documentation/swiftui/environmentvalues/symbolrenderingmode
 * → [{ name: 'swiftui', path: '/documentation/swiftui' },
 *    { name: 'environmentvalues', path: '/documentation/swiftui/environmentvalues' }]
 */
export declare function buildBreadcrumbs(url: string): Breadcrumb[];
/**
 * Resolve a reference to a manifest row.
 * Accepts:
 *   - ID: "18a1df7aeac96f2c"
 *   - doc:// URI: "doc://com.apple.SwiftUI/documentation/SwiftUI/View/padding"
 *   - Path: "/documentation/SwiftUI/View/padding"
 *   - Full URL: "https://developer.apple.com/documentation/SwiftUI/View/padding"
 */
export declare function resolveReference(ref: string, db: ReturnType<typeof getDb>): ManifestRow | undefined;
export declare function show(ref: string, _options: unknown, global: GlobalOptions): Promise<void>;
export {};
//# sourceMappingURL=show.d.ts.map