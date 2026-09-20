/**
 * Bibliography Item Hooks (lib/local/hooks/bib-items.ts)
 *
 * Functionality:
 * - Lists, creates, updates, and deletes bibliographic references on the `bibItems` Dexie / `bib_items` Supabase tables.
 * - Provides bulk insertion for imported citation lists.
 * - Initializes new items with a null embedding so vector search can fill it later.
 *
 * Notes:
 * - All mutations branch on isCollaborativeMode to target Supabase or IndexedDB.
 *
 * @author mrpi
 * @date 2026-09-16
 */

import { useLiveQuery } from "dexie-react-hooks";
import { localDB, type LocalBibItem, type BibItemMetadata } from "../db";
import { nanoid } from "nanoid";
import { now, resolveListQuery } from "./utils";
import { isCollaborativeMode } from "@/lib/supabase/collaborative";
import { remoteDelete, remoteInsert, remoteUpdate, useRemoteRows, type RemoteListQuery } from "@/lib/supabase/remote-query";

/** Lists bibliography items for a project. */
export function useLocalBibItems(projectId: string): RemoteListQuery<LocalBibItem> {
  const remote = useRemoteRows<LocalBibItem>("bib_items", "project_id", projectId);
  const local = useLiveQuery(
    () => localDB.bibItems.where("projectId").equals(projectId).toArray(),
    [projectId]
  );
  return resolveListQuery(remote, local);
}

/** Creates a bibliography item and returns its new id. */
export async function createBibItem(data: {
  projectId: string;
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  doi?: string;
  keywords?: string[];
  citationCount?: number;
  metadata?: BibItemMetadata;
}) {
  const id = nanoid();
  const item = {
    id,
    projectId: data.projectId,
    title: data.title,
    authors: data.authors,
    year: data.year,
    venue: data.venue,
    abstract: data.abstract,
    doi: data.doi,
    keywords: data.keywords,
    citationCount: data.citationCount,
    metadata: data.metadata,
    embeddingData: null,
    createdAt: now(),
  };
  if (isCollaborativeMode()) await remoteInsert("bib_items", item);
  else await localDB.bibItems.add(item);
  return id;
}

/** Patches a bibliography item by id. */
export async function updateBibItem(id: string, data: Partial<LocalBibItem>) {
  if (isCollaborativeMode()) await remoteUpdate("bib_items", id, data);
  else await localDB.bibItems.update(id, data as Partial<LocalBibItem>);
}

/** Deletes a bibliography item by id. */
export async function deleteBibItem(id: string) {
  if (isCollaborativeMode()) await remoteDelete("bib_items", id);
  else await localDB.bibItems.delete(id);
}

/** Bulk-inserts many bibliography items sharing one timestamp. */
export async function bulkCreateBibItems(
  items: Array<{
    projectId: string;
    title: string;
    authors?: string[];
    year?: number;
    venue?: string;
    abstract?: string;
    doi?: string;
    keywords?: string[];
    citationCount?: number;
    metadata?: BibItemMetadata;
  }>
) {
  const ts = now();
  const rows = items.map((item) => ({
      id: nanoid(),
      projectId: item.projectId,
      title: item.title,
      authors: item.authors,
      year: item.year,
      venue: item.venue,
      abstract: item.abstract,
      doi: item.doi,
      keywords: item.keywords,
      citationCount: item.citationCount,
      metadata: item.metadata,
      embeddingData: null,
      createdAt: ts,
    }));
  if (isCollaborativeMode()) {
    for (const row of rows) await remoteInsert("bib_items", row);
  } else await localDB.bibItems.bulkAdd(rows);
}
