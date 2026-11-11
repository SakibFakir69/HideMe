import { onLock } from './vault-session';

/**
 * The list of items the user was looking at when they opened the viewer.
 *
 * The grids set it before pushing `/vault/item/[id]`, so the viewer can page
 * through the very same set with a swipe. Keeping the ids in memory instead
 * of the route avoids putting a long list into the URL, which would break on
 * deep links and Android intent length limits.
 */

let browseIds: string[] = [];

export function setBrowseList(ids: string[]): void {
  browseIds = ids;
}

export function getBrowseList(): string[] {
  return browseIds;
}

export function clearBrowseList(): void {
  browseIds = [];
}

// A locked vault must not remember what was being browsed.
onLock(() => clearBrowseList());
