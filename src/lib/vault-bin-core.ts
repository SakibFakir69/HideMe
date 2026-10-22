// Pure helpers for the Recently-deleted bin. No RN/expo imports (node --test compatible).

/** Items in the bin are permanently deleted after 30 days. */
export const BIN_RETENTION_DAYS = 30;
export const BIN_RETENTION_MS = BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface BinEntry {
  deletedAt?: number;
  id: string;
}

/** Soft-deleted (in bin) items carry a deletedAt timestamp. */
export function isDeleted(entry: { deletedAt?: number }): boolean {
  return typeof entry.deletedAt === 'number' && entry.deletedAt > 0;
}

/** Items still visible in the vault (not in the bin), in original order. */
export function activeEntries<T extends { deletedAt?: number }>(entries: T[]): T[] {
  return entries.filter((it) => !isDeleted(it));
}

/** Bin items, newest deletion first. */
export function binEntries<T extends BinEntry>(entries: T[]): T[] {
  return entries
    .filter((it) => isDeleted(it))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** true when the entry has been in the bin for >= 30 days (clock-skew guard: future deletedAt never expires). */
export function isExpired(entry: { deletedAt?: number }, now: number): boolean {
  if (!isDeleted(entry)) return false;
  const at = entry.deletedAt as number;
  if (at > now) return false;
  return now - at >= BIN_RETENTION_MS;
}

/** Ids of bin entries that have reached the 30-day retention limit. */
export function expiredIds<T extends BinEntry>(entries: T[], now: number): string[] {
  return entries.filter((it) => isExpired(it, now)).map((it) => it.id);
}

/** Whole days left before permanent deletion (1..30; 0 only when expired — expired rows are purged before render). */
export function daysLeft(deletedAt: number, now: number): number {
  const remaining = deletedAt + BIN_RETENTION_MS - now;
  if (remaining <= 0) return 0;
  return Math.min(BIN_RETENTION_DAYS, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}
