import * as SecureStore from 'expo-secure-store';

const KEY = 'app.onboarded';

/** First-launch onboarding is skippable; failing open never traps a user. */
export async function hasOnboarded(): Promise<boolean> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return true;
    return (await SecureStore.getItemAsync(KEY)) !== null;
  } catch {
    return true;
  }
}

export async function markOnboarded(): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    // best-effort — worst case the flow shows once more
  }
}
