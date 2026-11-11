import { NativeModule, requireOptionalNativeModule } from 'expo';

export type DisguiseIcon = 'calculator' | 'notes' | 'photos' | 'weather' | 'music' | 'hidden';

declare class AppIconModule extends NativeModule<{}> {
  isSupported(): boolean;
  getActiveIcon(): DisguiseIcon;
  setActiveIcon(id: DisguiseIcon): boolean;
}

const AppIcon = requireOptionalNativeModule<AppIconModule>('AppIcon');

/** True when the native module is present AND the manifest declares aliases. */
export function isAppIconNative(): boolean {
  try {
    return AppIcon?.isSupported() === true;
  } catch {
    return false;
  }
}

export function getActiveAppIcon(): DisguiseIcon {
  try {
    const active = AppIcon?.getActiveIcon();
    if (
      active === 'calculator' ||
      active === 'notes' ||
      active === 'photos' ||
      active === 'weather' ||
      active === 'music' ||
      active === 'hidden'
    ) {
      return active;
    }
  } catch {
    // fall through to the manifest default
  }
  return 'calculator';
}

/** Switches the launcher entry. Returns false when the platform cannot. */
export function setActiveAppIcon(id: DisguiseIcon): boolean {
  try {
    return AppIcon?.setActiveIcon(id) === true;
  } catch {
    return false;
  }
}

export default AppIcon;
