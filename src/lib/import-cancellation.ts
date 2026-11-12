/**
 * Cancellation for a single import job.
 *
 * Every import gets its own token, so a cancellation can never reach another
 * operation — not another import, not the auto-lock, not a background task.
 * The token is the only thing the import pipeline knows about cancellation.
 *
 * Pure (no react-native imports) so it runs under node tests.
 */

/** Thrown when an import stops because the user asked it to. */
export class ImportCancelledError extends Error {
  constructor(message = 'Import cancelled') {
    super(message);
    this.name = 'ImportCancelledError';
  }
}

export interface ImportCancellation {
  /** True once `cancel()` was called. */
  readonly cancelled: boolean;
  /**
   * Throws `ImportCancelledError` when the job was cancelled.
   *
   * Call it before every unit of work and between the stages of a unit, so a
   * cancellation is noticed as early as possible without tearing down state
   * that is still in use.
   */
  throwIfCancelled(): void;
  /**
   * Marks the job as cancelled. Calling it more than once is a no-op, so a
   * user hammering the cancel button cannot corrupt the cleanup.
   */
  cancel(): void;
}

/** Creates a cancellation token for one import job. */
export function createImportCancellation(): ImportCancellation {
  let cancelled = false;
  return {
    get cancelled(): boolean {
      return cancelled;
    },
    cancel(): void {
      cancelled = true;
    },
    throwIfCancelled(): void {
      if (cancelled) throw new ImportCancelledError();
    },
  };
}

/** A token that never cancels — used when a caller does not care. */
export const NO_CANCELLATION: ImportCancellation = {
  cancelled: false,
  cancel: () => {},
  throwIfCancelled: () => {},
};
