import { type FeatureExtractionPipeline } from '@xenova/transformers';
export declare function getEmbedder(): Promise<FeatureExtractionPipeline>;
export declare function embed(text: string): Promise<Float32Array>;
export declare function embedBatch(texts: string[]): Promise<Float32Array[]>;
export declare function closeEmbedder(): void;
//# sourceMappingURL=embeddings.d.ts.map