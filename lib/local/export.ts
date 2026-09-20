/**
 * Local Data Export/Import (lib/local/export.ts)
 *
 * Functionality:
 * - Exports every Dexie table to a versioned JSON Blob (Blobs serialized as Base64).
 * - Imports a backup file, replacing all local data after a version check.
 * - Supports incremental export filtered by timestamp fields.
 * - Triggers browser downloads and (de)serializes ArrayBuffer/Blob values.
 *
 * Notes:
 * - Bump `EXPORT_VERSION` when the payload shape changes incompatibly.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { localDB } from "./db";

/**
 * IndexedDB backup JSON format version.
 * Bump when import can no longer read older payloads without a migration path.
 */
export const EXPORT_VERSION = "6.0";

// Shape of the exported backup JSON payload.
interface ExportData {
  version: string;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

// ── Full Export/Import ──────────────────────────────────────────────────

/**
 * Export all data from IndexedDB to a downloadable JSON Blob.
 * Includes Blob data (attachments) serialized as Base64.
 */
export async function exportAllData(): Promise<Blob> {
  const tables = localDB.tables;
  const data: Record<string, unknown[]> = {};

  for (const table of tables) {
    const rows = await table.toArray();
    data[table.name] = await Promise.all(
      rows.map((row) => serializeRow(row))
    );
  }

  const payload: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

/**
 * Import data from a JSON file, replacing all local data.
 */
export async function importAllData(file: File): Promise<void> {
  const text = await file.text();
  const payload: ExportData = JSON.parse(text);

  if (payload.version !== EXPORT_VERSION) {
    throw new Error(
      `Incompatible version: expected ${EXPORT_VERSION}, got ${payload.version}`
    );
  }

  await localDB.transaction("rw", localDB.tables, async () => {
    // Clear all tables
    for (const table of localDB.tables) {
      await table.clear();
    }

    // Bulk-put imported data
    for (const table of localDB.tables) {
      const rows = payload.data[table.name];
      if (rows && rows.length > 0) {
        const deserialized = rows.map((row) =>
          deserializeRow(row as Record<string, unknown>)
        );
        await table.bulkAdd(deserialized);
      }
    }
  });
}

// ── Incremental Export ──────────────────────────────────────────────────

/**
 * Export only records created/updated after the given timestamp.
 * Tables without timestamp fields are included in full.
 */
export async function exportIncremental(
  sinceTimestamp: string
): Promise<Blob> {
  const data: Record<string, unknown[]> = {};

  // Tables with updatedAt or createdAt fields
  const timestampedTables = [
    { name: "projects", field: "updatedAt" },
    { name: "manuscripts", field: "updatedAt" },
    { name: "manuscriptBlocks", field: "updatedAt" },
    { name: "bibItems", field: "createdAt" },
    { name: "experiments", field: "createdAt" },
    { name: "agentRuns", field: "startedAt" },
    { name: "auditLedger", field: "timestamp" },
    { name: "tasks", field: "id" }, // tasks don't have timestamps, include all
    { name: "attachments", field: "createdAt" },
    { name: "submissions", field: "id" },
    { name: "reviewRounds", field: "id" },
    { name: "rebuttalItems", field: "id" },
    { name: "ragChunks", field: "id" },
  ];

  for (const { name, field } of timestampedTables) {
    const table = localDB.table(name);
    const allRows = await table.toArray();
    // Filter rows that were created/updated after sinceTimestamp
    const filtered = allRows.filter((row) => {
      const ts = row[field] as string | undefined;
      if (!ts) return true; // Include rows without timestamps
      return ts >= sinceTimestamp;
    });
    data[name] = await Promise.all(
      filtered.map((row) => serializeRow(row))
    );
  }

  const payload: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

/**
 * Trigger browser download of a Blob.
 */
export function downloadExport(
  blob: Blob,
  filename?: string
): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ||
    `ischolar-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Serialization Helpers ──────────────────────────────────────────────

// Recursively convert ArrayBuffer/Blob values into tagged Base64 objects.
async function serializeRow(
  row: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof ArrayBuffer) {
      out[key] = { __type: "ArrayBuffer", data: arrayBufferToBase64(value) };
    } else if (value instanceof Blob) {
      // Serialize Blob data as Base64
      const buffer = await value.arrayBuffer();
      out[key] = {
        __type: "Blob",
        data: arrayBufferToBase64(buffer),
        mimeType: value.type || "application/octet-stream",
        size: value.size,
      };
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Rehydrate tagged Base64 objects back into ArrayBuffer/Blob values.
function deserializeRow(
  row: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (
      value &&
      typeof value === "object" &&
      "__type" in (value as Record<string, unknown>)
    ) {
      const typed = value as {
        __type: string;
        data?: string;
        mimeType?: string;
      };
      if (typed.__type === "ArrayBuffer" && typed.data) {
        out[key] = base64ToArrayBuffer(typed.data);
      } else if (typed.__type === "Blob" && typed.data) {
        out[key] = new Blob([base64ToArrayBuffer(typed.data)], {
          type: typed.mimeType || "application/octet-stream",
        });
      } else {
        out[key] = null;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Encode a binary buffer as a Base64 string for JSON transport.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Decode a Base64 string back into an ArrayBuffer.
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
