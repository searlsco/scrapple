import { closeDb } from '../db.js';
import { paths } from '../paths.js';
import { rmSync, existsSync } from 'node:fs';
import * as readline from 'node:readline';
export async function reset(options, global) {
    if (!options.confirm) {
        const confirmed = await promptConfirmation();
        if (!confirmed) {
            console.log('Reset cancelled.');
            return;
        }
    }
    // Close existing connection
    closeDb();
    // Delete all scraped data.
    const dataPath = paths.data.dir;
    if (existsSync(dataPath)) {
        rmSync(dataPath, { recursive: true, force: true });
        if (global.human)
            console.log(`Deleted data directory: ${dataPath}`);
    }
    if (global.human) {
        console.log('Reset complete. Run `scrapple sync` to rebuild from scratch.');
    }
    else {
        console.log(JSON.stringify({ reset: true }));
    }
}
async function promptConfirmation() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question('This will delete all scraped data. Type "confirm" to proceed: ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'confirm');
        });
    });
}
//# sourceMappingURL=reset.js.map