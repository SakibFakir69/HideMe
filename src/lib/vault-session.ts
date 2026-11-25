import { useSyncExternalStore } from 'react';

/**
 * In-memory vault session: holds the master key ONLY while unlocked.
 * Never persisted. lock() zeroizes (best effort) and notifies subscribers.
 * Plaintext cache cleanup is registered by the store via onLock().
 */

let masterKey: Uint8Array | null = null;
/** Decoy session: the vault screens operate on the decoy storage scope. */
let decoy = false;

const listeners = new Set<() => void>();
const lockCleanups = new Set<() => void>();
/** Registered by vault-store so storage switches scope in step with unlock. */
let scopeHook: ((decoy: boolean) => void) | null = null;

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

export function isDecoyVault(): boolean {
  return decoy;
}

export function unlock(key: Uint8Array, opts?: { decoy?: boolean }): void {
  masterKey = key;
  decoy = opts?.decoy ?? false;
  scopeHook?.(decoy);
  emit();
}

export function getMasterKey(): Uint8Array {
  if (!masterKey) throw new Error('Vault is locked.');
  return masterKey;
}

export function lock(): void {
  if (masterKey) masterKey.fill(0);
  masterKey = null;
  decoy = false;
  scopeHook?.(false);
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

/**
 * vault-store registers this once, at module load. The current state is
 * replayed so registration order never matters: the store may be loaded for
 * the first time *after* a decoy unlock (a deep link straight to a vault
 * screen), and it must still open the decoy space, never the real one.
 */
export function setScopeHook(hook: (decoy: boolean) => void): void {
  scopeHook = hook;
  hook(decoy);
}

export function useVaultUnlocked(): boolean {
  return useSyncExternalStore(subscribe, isUnlocked, () => false);
}

export function useVaultDecoy(): boolean {
  return useSyncExternalStore(subscribe, isDecoyVault, () => false);
}
