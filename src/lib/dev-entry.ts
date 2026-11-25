/**
 * Dev entry point.
 *
 * Set the env var before starting the dev server to land on a screen other
 * than the calculator gate — the first-run flow is otherwise unreachable once
 * the app is set up:
 *
 *   EXPO_PUBLIC_DEV_ENTRY=onboarding npx expo start --dev-client
 *   EXPO_PUBLIC_DEV_ENTRY=setup-secret npx expo start --dev-client
 *
 * The value is read from the bundle, so it only ever applies to a build made
 * with that variable set. A shipped build has no entry and always starts at
 * the gate.
 */

export type DevEntry = 'onboarding' | 'setup-secret' | 'calculator-disguise';

const ENTRIES: DevEntry[] = ['onboarding', 'setup-secret', 'calculator-disguise'];

/** The screen the app should open on, or null for the normal boot flow. */
export function getDevEntry(): DevEntry | null {
  const value = process.env.EXPO_PUBLIC_DEV_ENTRY;
  return ENTRIES.find((entry) => entry === value) ?? null;
}
