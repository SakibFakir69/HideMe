import { Ionicons } from '@expo/vector-icons';

import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { getMasterKey } from '@/lib/vault-session';
import { moveItemsToFolder } from '@/lib/vault-store';

interface MoveItemsSheetProps {
  visible: boolean;
  ids: string[];
  onClose: () => void;
  /** called after a successful move (sheet may already be closed) */
  onChanged: () => void;
}

/** Folder picker for a multi-select batch move. */
export function MoveItemsSheet({ visible, ids, onClose, onChanged }: MoveItemsSheetProps) {
  const theme = useTheme();
  const { index } = useVaultIndex();
  if (!visible || !index || ids.length === 0) return null;

  const label = `Move ${ids.length} item${ids.length === 1 ? '' : 's'}`;
  const actions = [
    {
      label: 'All items (no folder)',
      icon: <Ionicons name="folder-open-outline" size={18} color={theme.text} />,
      onSelect: async () => {
        await moveItemsToFolder(getMasterKey(), ids, null);
        onChanged();
      },
    },
    ...index.folders.map((folder) => ({
      label: folder.name,
      icon: <Ionicons name="folder-outline" size={18} color={theme.text} />,
      onSelect: async () => {
        await moveItemsToFolder(getMasterKey(), ids, folder.id);
        onChanged();
      },
    })),
  ];

  return <ActionSheetModal visible={visible} title={label} actions={actions} onClose={onClose} />;
}
