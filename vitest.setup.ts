import "@testing-library/jest-dom/vitest";

// Mock Web Crypto API (jsdom does not provide crypto.subtle)
if (typeof crypto !== "undefined" && !crypto.subtle) {
  // Simple SHA-256 mock that returns a deterministic hex string
  Object.defineProperty(crypto, "subtle", {
    value: {
      async digest(_algorithm: string, data: BufferSource) {
        // Convert input to a simple hash for testing
        const bytes =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        let hash = 0;
        for (const byte of bytes) {
          hash = ((hash << 5) - hash + byte) | 0;
        }
        // Return 32 bytes (SHA-256 output size)
        const result = new ArrayBuffer(32);
        const view = new DataView(result);
        for (let i = 0; i < 8; i++) {
          view.setUint32(i * 4, hash ^ (i * 0x9e3779b9));
        }
        return result;
      },
    },
    configurable: true,
    writable: true,
  });
}

// Mock crypto.randomUUID if not available
if (typeof crypto !== "undefined" && !crypto.randomUUID) {
  Object.defineProperty(crypto, "randomUUID", {
    value: () =>
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }),
    configurable: true,
    writable: true,
  });
}
