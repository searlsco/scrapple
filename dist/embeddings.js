import { pipeline } from '@xenova/transformers';
// Singleton embedding pipeline (lazy-loaded)
let embeddingPipeline = null;
// Maximum text length for embedding (MiniLM has ~256 token limit)
const MAX_TEXT_LENGTH = 2000;
export async function getEmbedder() {
    if (!embeddingPipeline) {
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return embeddingPipeline;
}
export async function embed(text) {
    const embedder = await getEmbedder();
    const truncated = text.slice(0, MAX_TEXT_LENGTH);
    const result = await embedder(truncated, { pooling: 'mean', normalize: true });
    // result.data is typed as DataArray which could be various types
    // For this model it's Float32Array, so cast it
    return new Float32Array(result.data);
}
export async function embedBatch(texts) {
    const embedder = await getEmbedder();
    const truncated = texts.map(t => t.slice(0, MAX_TEXT_LENGTH));
    // Process one at a time to avoid memory issues
    // (batch processing with this library can be problematic)
    const embeddings = [];
    for (const text of truncated) {
        const result = await embedder(text, { pooling: 'mean', normalize: true });
        embeddings.push(new Float32Array(result.data));
    }
    return embeddings;
}
export function closeEmbedder() {
    embeddingPipeline = null;
}
//# sourceMappingURL=embeddings.js.map