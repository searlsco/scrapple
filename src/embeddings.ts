import { pipeline, type FeatureExtractionPipeline, Tensor } from '@xenova/transformers'

// Singleton embedding pipeline (lazy-loaded)
let embeddingPipeline: FeatureExtractionPipeline | null = null

// Maximum text length for embedding (MiniLM has ~256 token limit)
const MAX_TEXT_LENGTH = 2000

export const EMBEDDINGS_AVAILABLE = true

export async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    ) as FeatureExtractionPipeline
  }
  return embeddingPipeline
}

export async function embed(text: string): Promise<Float32Array> {
  const embedder = await getEmbedder()
  const truncated = text.slice(0, MAX_TEXT_LENGTH)
  const result = await embedder(truncated, { pooling: 'mean', normalize: true }) as Tensor
  // result.data is typed as DataArray which could be various types
  // For this model it's Float32Array, so cast it
  return new Float32Array(result.data as Float32Array)
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const embedder = await getEmbedder()
  const truncated = texts.map(t => t.slice(0, MAX_TEXT_LENGTH))

  // Process one at a time to avoid memory issues
  // (batch processing with this library can be problematic)
  const embeddings: Float32Array[] = []
  for (const text of truncated) {
    const result = await embedder(text, { pooling: 'mean', normalize: true }) as Tensor
    embeddings.push(new Float32Array(result.data as Float32Array))
  }
  return embeddings
}

export function closeEmbedder(): void {
  embeddingPipeline = null
}
