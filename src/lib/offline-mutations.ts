// ─── Generic Offline Mutation Queue (IndexedDB) ───
// Queues any failed mutation while offline and replays when connectivity returns.

import { get, set, del, keys } from "idb-keyval";

const QUEUE_PREFIX = "probook-mutation-";

export interface QueuedMutation {
  id: string;
  timestamp: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  retryCount: number;
  status: "pending" | "syncing" | "failed";
  error?: string;
  /** Human-readable label shown in the offline indicator */
  label?: string;
}

function mutationKey(id: string) {
  return `${QUEUE_PREFIX}${id}`;
}

export async function queueMutation(
  request: Request,
  label?: string
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = request.body ? await request.clone().text() : null;
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const entry: QueuedMutation = {
    id,
    timestamp: new Date().toISOString(),
    url: request.url,
    method: request.method,
    headers,
    body,
    retryCount: 0,
    status: "pending",
    label,
  };

  await set(mutationKey(id), entry);
  return id;
}

/** Queue a mutation from plain data (used by apiCall). */
export async function queueMutationRaw(params: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  label?: string;
}): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const entry: QueuedMutation = {
    id,
    timestamp: new Date().toISOString(),
    url: params.url,
    method: params.method,
    headers: params.headers,
    body: params.body,
    retryCount: 0,
    status: "pending",
    label: params.label,
  };

  await set(mutationKey(id), entry);

  // Notify any listeners (e.g. OfflineIndicator) about the new mutation
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("probook:mutation-queued"));
  }

  return id;
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const allKeys = await keys();
  const mutationKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith(QUEUE_PREFIX)
  );

  const entries: QueuedMutation[] = [];
  for (const key of mutationKeys) {
    const entry = await get<QueuedMutation>(key);
    if (entry && (entry.status === "pending" || entry.status === "failed")) {
      entries.push(entry);
    }
  }

  return entries.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export async function getPendingMutationCount(): Promise<number> {
  const pending = await getPendingMutations();
  return pending.length;
}

async function updateMutation(mutation: QueuedMutation): Promise<void> {
  await set(mutationKey(mutation.id), mutation);
}

async function removeMutation(id: string): Promise<void> {
  await del(mutationKey(id));
}

const MAX_RETRIES = 10;

export async function replayMutations(): Promise<{
  synced: number;
  failed: number;
}> {
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  const pending = await getPendingMutations();
  let synced = 0;
  let failed = 0;

  for (const mutation of pending) {
    if (mutation.retryCount >= MAX_RETRIES) {
      failed++;
      continue;
    }

    mutation.status = "syncing";
    await updateMutation(mutation);

    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: mutation.headers,
        body: mutation.method !== "GET" ? mutation.body : undefined,
        credentials: "include", // send auth cookies for replay
      });

      if (res.ok) {
        await removeMutation(mutation.id);
        synced++;
      } else if (res.status === 409 && typeof window !== "undefined") {
        // Conflict: emit event for user resolution
        const serverData = await res.json().catch(() => ({}));
        mutation.status = "failed";
        mutation.error = "Conflict: record was modified";
        await updateMutation(mutation);

        // Dispatch conflict event and wait for resolution
        await new Promise<void>((resolve) => {
          const handler = () => {
            window.removeEventListener("probook:conflict-resolved", handler);
            resolve();
          };
          window.addEventListener("probook:conflict-resolved", handler);
          window.dispatchEvent(
            new CustomEvent("probook:conflict", {
              detail: { mutation, serverData },
            })
          );
        });
        // After resolution, re-check if the mutation was removed (resolved)
        const stillExists = await get(mutationKey(mutation.id));
        if (stillExists) {
          failed++;
        } else {
          synced++;
        }
      } else {
        const text = await res.text().catch(() => "Unknown error");
        mutation.status = "failed";
        mutation.error = `HTTP ${res.status}: ${text}`;
        mutation.retryCount++;
        await updateMutation(mutation);
        failed++;
      }
    } catch (err) {
      mutation.status = "failed";
      mutation.error =
        err instanceof Error ? err.message : "Network error";
      mutation.retryCount++;
      await updateMutation(mutation);
      failed++;
    }
  }

  return { synced, failed };
}

export async function clearAllMutations(): Promise<void> {
  const allKeys = await keys();
  for (const key of allKeys) {
    if (typeof key === "string" && key.startsWith(QUEUE_PREFIX)) {
      await del(key);
    }
  }
}

export async function replaySingleMutation(id: string): Promise<boolean> {
  const mutation = (await get(mutationKey(id))) as QueuedMutation | undefined;
  if (!mutation) return false;

  try {
    const res = await fetch(mutation.url, {
      method: mutation.method,
      headers: mutation.headers,
      body: mutation.method !== "GET" ? mutation.body : undefined,
      credentials: "include",
    });
    if (res.ok) {
      await removeMutation(id);
      return true;
    }
    mutation.retryCount++;
    mutation.status = "failed";
    await updateMutation(mutation);
    return false;
  } catch {
    return false;
  }
}

export async function discardMutation(id: string): Promise<void> {
  await removeMutation(id);
}

export async function getAllMutations(): Promise<QueuedMutation[]> {
  const allKeys = await keys();
  const mutationKeys = allKeys.filter(
    (k) => typeof k === "string" && k.startsWith(QUEUE_PREFIX)
  );

  const entries: QueuedMutation[] = [];
  for (const key of mutationKeys) {
    const entry = await get<QueuedMutation>(key);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}
