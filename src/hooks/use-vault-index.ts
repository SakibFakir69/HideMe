import { useCallback, useEffect, useState } from 'react';

import { errorMessage, loadIndex, type VaultIndex } from '@/lib/vault-store';
import { getMasterKey, isUnlocked, useVaultUnlocked } from '@/lib/vault-session';

interface VaultIndexState {
  index: VaultIndex | null;
  error: string | null;
  loading: boolean;
}

function snapshotOf(index: VaultIndex): VaultIndex {
  // Store mutates the cached object in place — hand out fresh containers so
  // React sees changes after refresh().
  return { ...index, folders: [...index.folders], items: [...index.items] };
}

export function useVaultIndex() {
  const unlocked = useVaultUnlocked();
  const [state, setState] = useState<VaultIndexState>({ index: null, error: null, loading: true });

  const refresh = useCallback(async () => {
    if (!isUnlocked()) {
      setState({ index: null, error: null, loading: false });
      return;
    }
    try {
      const index = await loadIndex(getMasterKey());
      setState({ index: snapshotOf(index), error: null, loading: false });
    } catch (error) {
      setState((prev) => ({ ...prev, error: errorMessage(error), loading: false }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, unlocked]);

  return { ...state, refresh };
}
