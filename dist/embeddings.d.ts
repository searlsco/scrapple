export declare const EMBEDDINGS_AVAILABLE = false;
export declare function embed(_text: string): Promise<Float32Array | null>;
export declare function embedBatch(_texts: string[]): Promise<(Float32Array | null)[]>;
export declare function closeEmbedder(): void;
//# sourceMappingURL=embeddings.d.ts.map