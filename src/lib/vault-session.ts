import { useSyncExternalStore } from 'react';

/**
 * In-memory vault session: holds the master key ONLY while unlocked.
 * Never persisted. lock() zeroizes (best effort) and notifies subscribers.
 * Plaintext cache cleanup is registered by the store via onLock().
 */

let masterKey: Uint8Array | null = null;

const listeners = new Set<() => void>();
const lockCleanups = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isUnlocked(): boolean {
  return masterKey !== null;
}

export function unlock(key: Uint8Array): void {
  masterKey = key;
  emit();
}

export function getMasterKey(): Uint8Array {
  if (!masterKey) throw new Error('Vault is locked.');
  return masterKey;
}

export function lock(): void {
  if (masterKey) masterKey.fill(0);
  masterKey = null;
  for (const cleanup of lockCleanups) {
    try {
      cleanup();
    } catch {
      // cleanups must never block locking
    }
  }
  emit();
}

/** Register a cleanup that runs on every lock (e.g. purge plaintext cache). */
export function onLock(cleanup: () => void): () => void {
  lockCleanups.add(cleanup);
  return () => lockCleanups.delete(cleanup);
}

export function useVaultUnlocked(): boolean {
  return useSyncExternalStore(subscribe, isUnlocked, () => false);
}
