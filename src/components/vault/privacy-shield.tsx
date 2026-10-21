import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const SHIELD_KEY = 'vault';
const BLUR_INTENSITY = 0.7;

/**
 * Blocks screenshots/screen recording (Android FLAG_SECURE + iOS) and the
 * iOS app-switcher snapshot — but ONLY while mounted, i.e. only while the
 * vault is unlocked. On lock it unmounts and restores normal capture, so
 * the locked calculator behaves like any ordinary app (a calculator that
 * refuses screenshots would be suspicious).
 *
 * Mounted by vault/_layout.tsx. Web is a no-op (module is Android/iOS).
 */
export function PrivacyShield() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let unmounted = false;

    (async () => {
      try {
        await ScreenCapture.preventScreenCaptureAsync(SHIELD_KEY);
        if (Platform.OS === 'ios') {
          await ScreenCapture.enableAppSwitcherProtectionAsync(BLUR_INTENSITY);
        }
      } catch {
        // protection is best-effort; never break the UI over it
      }
      if (unmounted) {
        // raced with unmount — restore capture immediately
        void releaseShield();
      }
    })();

    return () => {
      unmounted = true;
      void releaseShield();
    };
  }, []);

  return null;
}

async function releaseShield(): Promise<void> {
  try {
    await ScreenCapture.allowScreenCaptureAsync(SHIELD_KEY);
    if (Platform.OS === 'ios') {
      await ScreenCapture.disableAppSwitcherProtectionAsync();
    }
  } catch {
    // ignore
  }
}
