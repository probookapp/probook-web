/**
 * Thrown by apiCall when a queueable write fails with a NETWORK error and the
 * mutation was saved to the unified offline queue instead. Callers catch this
 * to show the "saved offline" toast and continue their success flow — the
 * server never received the write, so there is no created entity/id to use.
 */
export class OfflineQueuedError extends Error {
  readonly queuedId: string;
  readonly command: string;

  constructor(queuedId: string, command: string) {
    super(`Offline: "${command}" was queued for sync (queue id ${queuedId})`);
    this.name = "OfflineQueuedError";
    this.queuedId = queuedId;
    this.command = command;
  }
}

export function isOfflineQueuedError(err: unknown): err is OfflineQueuedError {
  return err instanceof OfflineQueuedError;
}
