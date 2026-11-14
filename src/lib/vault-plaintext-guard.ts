/**
 * Guards the decrypted cache against a purge while another app is still
 * reading a file.
 *
 * When the vault shares a file, the receiving app reads it from the cache
 * afterwards. A lock in that window would delete the plaintext the other
 * app is still opening, so the purge is deferred until the handoff is done.
 *
 * The rule is pure — no filesystem, no React Native — so it can be tested
 * directly.
 */

export interface PlaintextGuard {
  /** Pins the cache. Call the returned function to release the pin. */
  hold(): () => void;
  /**
   * Runs the purge now, or defers it while the cache is pinned.
   *
   * Returns true when the purge ran right away. A deferred purge runs when
   * the last pin is released.
   */
  requestPurge(purge: () => void): boolean;
  /** How many pins are open. */
  readonly holders: number;
  /** True when a purge is waiting for the last pin. */
  readonly purgeDeferred: boolean;
}

export function createPlaintextGuard(): PlaintextGuard {
  let holders = 0;
  let deferred = false;
  let pending: (() => void) | null = null;

  const release = () => {
    if (holders > 0) holders -= 1;
    if (holders === 0 && deferred && pending) {
      deferred = false;
      const purge = pending;
      pending = null;
      purge();
    }
  };

  return {
    hold(): () => void {
      holders += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
      };
    },
    requestPurge(purge: () => void): boolean {
      if (holders > 0) {
        deferred = true;
        pending = purge;
        return false;
      }
      purge();
      return true;
    },
    get holders(): number {
      return holders;
    },
    get purgeDeferred(): boolean {
      return deferred;
    },
  };
}
