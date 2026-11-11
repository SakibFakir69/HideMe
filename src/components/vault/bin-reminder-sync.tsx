import { useEffect } from 'react';

import { useVaultIndex } from '@/hooks/use-vault-index';
import { syncBinReminder } from '@/lib/reminders';

/**
 * Keeps the Recently Deleted reminder in sync with reality: one daily local
 * notification while the bin is non-empty, none when it is emptied or the user
 * turns reminders off. Mounted inside the unlocked vault so it can only ever
 * observe the index while the key is available.
 */
export function BinReminderSync() {
  const { index } = useVaultIndex();
  const binCount = index
    ? index.items.filter((item) => item.deletedAt !== undefined).length
    : -1;

  useEffect(() => {
    if (binCount < 0) return;
    void syncBinReminder(binCount);
  }, [binCount]);

  return null;
}
