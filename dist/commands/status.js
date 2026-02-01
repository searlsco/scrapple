import { getDb } from '../db.js';
export async function status(global) {
    const db = getDb();
    const byStatus = db
        .prepare('SELECT status, COUNT(*) as count FROM manifest GROUP BY status')
        .all();
    const byType = db
        .prepare('SELECT type, COUNT(*) as count FROM manifest GROUP BY type')
        .all();
    const total = db
        .prepare('SELECT COUNT(*) as count FROM manifest')
        .get();
    const indexed = db
        .prepare('SELECT COUNT(DISTINCT id) as count FROM content')
        .get();
    const failed = db
        .prepare("SELECT url, title FROM manifest WHERE status = 'failed' LIMIT 10")
        .all();
    if (global.human) {
        console.log('=== Scrapple Status ===\n');
        // Type counts table
        const typeWidth = Math.max(10, ...byType.map(r => r.type.length));
        const countWidth = Math.max(7, ...byType.map(r => r.count.toLocaleString().length));
        console.log('By Type:');
        console.log(`  ${'─'.repeat(typeWidth + countWidth + 7)}`);
        console.log(`  │ ${'Type'.padEnd(typeWidth)} │ ${'Count'.padStart(countWidth)} │`);
        console.log(`  ${'─'.repeat(typeWidth + countWidth + 7)}`);
        for (const row of byType) {
            console.log(`  │ ${row.type.padEnd(typeWidth)} │ ${row.count.toLocaleString().padStart(countWidth)} │`);
        }
        console.log(`  ${'─'.repeat(typeWidth + countWidth + 7)}`);
        // Status counts table
        const statusWidth = Math.max(10, ...byStatus.map(r => r.status.length));
        const statusCountWidth = Math.max(7, ...byStatus.map(r => r.count.toLocaleString().length));
        console.log('\nBy Status:');
        console.log(`  ${'─'.repeat(statusWidth + statusCountWidth + 7)}`);
        console.log(`  │ ${'Status'.padEnd(statusWidth)} │ ${'Count'.padStart(statusCountWidth)} │`);
        console.log(`  ${'─'.repeat(statusWidth + statusCountWidth + 7)}`);
        for (const row of byStatus) {
            console.log(`  │ ${row.status.padEnd(statusWidth)} │ ${row.count.toLocaleString().padStart(statusCountWidth)} │`);
        }
        console.log(`  ${'─'.repeat(statusWidth + statusCountWidth + 7)}`);
        console.log(`\nTotal resources: ${total.count.toLocaleString()}`);
        console.log(`Indexed documents: ${indexed.count.toLocaleString()}`);
        if (failed.length > 0) {
            console.log('\nRecent failures:');
            for (const f of failed) {
                console.log(`  - ${f.title || f.url}`);
            }
        }
    }
    else {
        console.log(JSON.stringify({
            byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
            byType: Object.fromEntries(byType.map(r => [r.type, r.count])),
            total: total.count,
            indexed: indexed.count,
            recentFailures: failed,
        }));
    }
}
//# sourceMappingURL=status.js.map