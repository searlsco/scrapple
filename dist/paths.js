import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
const HOME = homedir();
export const paths = {
    config: {
        dir: join(HOME, '.config', 'scrapple'),
        file: join(HOME, '.config', 'scrapple', 'config.yaml'),
    },
    data: {
        dir: join(HOME, '.local', 'share', 'scrapple'),
        raw: {
            dir: join(HOME, '.local', 'share', 'scrapple', 'raw'),
            docs: join(HOME, '.local', 'share', 'scrapple', 'raw', 'docs_json'),
            videos: join(HOME, '.local', 'share', 'scrapple', 'raw', 'videos_html'),
            samples: join(HOME, '.local', 'share', 'scrapple', 'raw', 'sample_zips'),
        },
        normalized: {
            dir: join(HOME, '.local', 'share', 'scrapple', 'normalized'),
            docs: join(HOME, '.local', 'share', 'scrapple', 'normalized', 'docs_md'),
            transcripts: join(HOME, '.local', 'share', 'scrapple', 'normalized', 'transcripts_txt'),
            samples: join(HOME, '.local', 'share', 'scrapple', 'normalized', 'samples'),
        },
        index: {
            dir: join(HOME, '.local', 'share', 'scrapple', 'index'),
            db: join(HOME, '.local', 'share', 'scrapple', 'index', 'scrapple.sqlite'),
        },
        logs: join(HOME, '.local', 'share', 'scrapple', 'logs'),
    },
};
export function ensureDirectories() {
    const dirs = [
        paths.config.dir,
        paths.data.raw.docs,
        paths.data.raw.videos,
        paths.data.raw.samples,
        paths.data.normalized.docs,
        paths.data.normalized.transcripts,
        paths.data.normalized.samples,
        paths.data.index.dir,
        paths.data.logs,
    ];
    for (const dir of dirs) {
        mkdirSync(dir, { recursive: true });
    }
}
//# sourceMappingURL=paths.js.map