/**
 * Browser-side vector store using Transformers.js + IndexedDB.
 *
 * Functionality:
 * - Model: Xenova/all-MiniLM-L6-v2 (384-dim, ~25MB quantized)
 * - Lazy-loads on the first embedText() call and auto-caches via the browser Cache API
 * - Computes cosine similarity searches in-memory against IndexedDB candidates
 * - Keeps a 5-minute in-memory embedding cache with oldest-entry eviction
 *
 * Notes:
 * - Embeddings are Float32Arrays; use embeddingToArrayBuffer to persist them to IndexedDB.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import type { FeatureExtractionPipeline } from "@huggingface/transformers";

// Lazy singleton
let pipelineInstance: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

/** Progress callback emitted while the embedding model downloads/loads. */
export type EmbeddingProgressCallback = (info: {
  status: string;
  progress?: number;
  loaded?: number;
  total?: number;
}) => void;

let progressCb: EmbeddingProgressCallback | null = null;

/**
 * Register a progress callback for model loading.
 */
export function onEmbeddingProgress(cb: EmbeddingProgressCallback): void {
  progressCb = cb;
}

/**
 * Get or load the embedding pipeline (singleton).
 */
async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (pipelineInstance) return pipelineInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      dtype: "q8",
      progress_callback: (info: { status: string; progress?: number; loaded?: number; total?: number }) => {
        if (progressCb) progressCb(info);
      },
    });
    pipelineInstance = pipe;
    return pipe;
  })();

  return loadingPromise;
}

// ── Embedding Cache ────────────────────────────────────────────

const embeddingCache = new Map<string, { embedding: Float32Array; timestamp: number }>();
const EMBEDDING_CACHE_MAX = 50;
const EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Returns a cached embedding if present and not past its TTL, else null.
function getCachedEmbedding(text: string): Float32Array | null {
  const entry = embeddingCache.get(text);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > EMBEDDING_CACHE_TTL_MS) {
    embeddingCache.delete(text);
    return null;
  }
  return entry.embedding;
}

// Stores an embedding, evicting the oldest entry when the cache is full.
function setCachedEmbedding(text: string, embedding: Float32Array): void {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    // Evict oldest entry (first key in insertion order)
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey !== undefined) embeddingCache.delete(oldestKey);
  }
  embeddingCache.set(text, { embedding, timestamp: Date.now() });
}

/** Clear the embedding cache (useful for testing). */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

// ── Embedding Functions ────────────────────────────────────────

/**
 * Generate a 384-dimensional embedding for a text string.
 * Results are cached for 5 minutes.
 */
export async function embedText(text: string): Promise<Float32Array> {
  const cached = getCachedEmbedding(text);
  if (cached) return cached;

  const pipe = await getPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  const embedding = output.data as Float32Array;
  setCachedEmbedding(text, embedding);
  return embedding;
}

/**
 * Batch embed multiple texts using concurrent batches.
 * Processes in groups of `concurrency` to balance throughput vs memory.
 */
export async function embedTexts(
  texts: string[],
  concurrency: number = 4
): Promise<Float32Array[]> {
  const pipe = await getPipeline();
  const results: Float32Array[] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((text) =>
        pipe(text, { pooling: "mean", normalize: true }).then(
          (output) => output.data as Float32Array
        )
      )
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Search for the most similar candidates to a query string.
 *
 * @param query - The search query text
 * @param candidates - Array of {id, embeddingData} where embeddingData is ArrayBuffer
 * @param topK - Number of results to return
 * @returns Array of {id, score} sorted by descending score
 */
export async function searchSimilar(
  query: string,
  candidates: Array<{ id: string; embeddingData?: ArrayBuffer | null }>,
  topK: number = 10
): Promise<Array<{ id: string; score: number }>> {
  if (!candidates.length) return [];

  const queryEmbedding = await embedText(query);

  const scored = candidates
    .filter((c) => c.embeddingData) // skip items without embeddings
    .map((c) => {
      const candidateEmbedding = new Float32Array(c.embeddingData!);
      return {
        id: c.id,
        score: cosineSimilarity(queryEmbedding, candidateEmbedding),
      };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Encode a Float32Array to ArrayBuffer for IndexedDB storage.
 */
export function embeddingToArrayBuffer(embedding: Float32Array): ArrayBuffer {
  return new Float32Array(embedding).buffer as ArrayBuffer;
}

/**
 * Check if the embedding pipeline is loaded and ready.
 */
export function isPipelineReady(): boolean {
  return pipelineInstance !== null;
}
