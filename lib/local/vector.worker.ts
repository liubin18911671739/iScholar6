/**
 * Web Worker for running embedding pipeline off the main thread.
 *
 * Functionality:
 * - Loads the Xenova/all-MiniLM-L6-v2 feature-extraction pipeline inside a worker.
 * - Answers `load`, `embed`, and `embedBatch` messages with embeddings or errors.
 * - Reports model download progress back to the main thread via progress messages.
 *
 * Notes:
 * - Usage from vector.ts:
 *   const worker = new Worker(new URL('./vector.worker.ts', import.meta.url));
 *   worker.postMessage({ type: 'embed', text: 'hello' });
 *   worker.onmessage = (e) => { ... };
 *
 * @author mrpi
 * @date 2026-09-16
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Cached embedding pipeline instance shared across messages in this worker.
// eslint-disable-next-line @typescript-eslint/no-require-imports
let pipe: any = null;

// Lazily loads and caches the feature-extraction pipeline for the worker.
async function loadPipeline(): Promise<any> {
  if (pipe) return pipe;
  const { pipeline } = await import("@huggingface/transformers");
  pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    dtype: "q8",
    progress_callback: (info: { status: string; progress?: number }) => {
      self.postMessage({ type: "progress", ...info });
    },
  });
  return pipe;
}

// Handles load/embed/embedBatch requests and posts results or errors back.
self.onmessage = async (e: MessageEvent) => {
  const { type, text, texts } = e.data as {
    type: string;
    text?: string;
    texts?: string[];
  };

  try {
    if (type === "load") {
      await loadPipeline();
      self.postMessage({ type: "loaded" });
    }

    if (type === "embed" && text) {
      const p = await loadPipeline();
      const output = await p(text, { pooling: "mean", normalize: true });
      const data = output.data as Float32Array;
      // Transfer the buffer for zero-copy
      self.postMessage({ type: "embedding", data: data.buffer }, { transfer: [data.buffer] });
    }

    if (type === "embedBatch" && texts) {
      const p = await loadPipeline();
      const results: ArrayBuffer[] = [];
      for (const t of texts) {
        const output = await p(t, { pooling: "mean", normalize: true });
        const data = output.data as Float32Array;
        results.push(new Float32Array(data).buffer as ArrayBuffer);
      }
      self.postMessage({ type: "embeddings", data: results });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
