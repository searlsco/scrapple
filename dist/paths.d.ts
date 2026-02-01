export declare const paths: {
    readonly config: {
        readonly dir: string;
        readonly file: string;
    };
    readonly data: {
        readonly dir: string;
        readonly raw: {
            readonly dir: string;
            readonly docs: string;
            readonly videos: string;
            readonly samples: string;
        };
        readonly normalized: {
            readonly dir: string;
            readonly docs: string;
            readonly transcripts: string;
            readonly samples: string;
        };
        readonly index: {
            readonly dir: string;
            readonly db: string;
        };
        readonly logs: string;
    };
};
export declare function ensureDirectories(): void;
//# sourceMappingURL=paths.d.ts.map