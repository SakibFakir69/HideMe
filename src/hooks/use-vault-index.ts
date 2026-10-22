import { useCallback, useEffect, useState } from 'react';

import {
  errorMessage,
  loadIndex,
  purgeExpired,
  subscribeIndex,
  type VaultIndex,
} from '@/lib/vault-store';
import { getMasterKey, isUnlocked, useVaultUnlocked } from '@/lib/vault-session';

interface VaultIndexState {
  index: VaultIndex | null;
  error: string | null;
  loading: boolean;
  /** wall-clock at the last successful refresh — drives bin countdowns (pure render) */
  now: number;
}

function snapshotOf(index: VaultIndex): VaultIndex {
  // Store mutates the cached object in place — hand out fresh containers so
  // React sees changes after refresh().
  return { ...index, folders: [...index.folders], items: [...index.items] };
}

export function useVaultIndex() {
  const unlocked = useVaultUnlocked();
  const [state, setState] = useState<VaultIndexState>({
    index: null,
    error: null,
    loading: true,
    now: 0,
  });

  const refresh = useCallback(async () => {
    if (!isUnlocked()) {
      setState({ index: null, error: null, loading: false, now: 0 });
      return;
    }
    try {
      const index = await loadIndex(getMasterKey());
      // 30-day bin retention sweep (cheap no-op unless something expired).
      await purgeExpired(getMasterKey());
      setState({ index: snapshotOf(index), error: null, loading: false, now: Date.now() });
    } catch (error) {
      setState((prev) => ({ ...prev, error: errorMessage(error), loading: false }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Re-refresh whenever any screen mutates the index (delete/restore/import/rename…).
    return subscribeIndex(() => {
      void refresh();
    });
  }, [refresh, unlocked]);

  return { ...state, refresh };
}
