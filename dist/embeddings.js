// Embeddings disabled - @huggingface/transformers has sharp dependency issues
// TODO: Re-enable when sharp works with Node 25 / Homebrew
export const EMBEDDINGS_AVAILABLE = false;
export async function embed(_text) {
    return null;
}
export async function embedBatch(_texts) {
    return _texts.map(() => null);
}
export function closeEmbedder() {
    // no-op
}
//# sourceMappingURL=embeddings.js.map