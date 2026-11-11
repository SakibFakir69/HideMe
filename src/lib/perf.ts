/**
 * Startup and unlock timings.
 *
 * The "perceived instant" target needs real numbers on a real device: the
 * debug logs are gone in a release build, and a debugger changes the timing.
 * The marks are collected in memory and shown in Settings → Performance.
 *
 * The origin is the moment this module is first evaluated, which is one of
 * the first things the root layout imports — close enough to app start for
 * the numbers to be comparable between runs.
 */

export interface PerfMark {
  name: string;
  /** Milliseconds since the module was first evaluated. */
  at: number;
}

const origin = Date.now();
const marks: PerfMark[] = [];
const MAX_MARKS = 40;

/** Records a point in time. Names should read as "what just happened". */
export function mark(name: string): void {
  const at = Date.now() - origin;
  marks.push({ name, at });
  if (marks.length > MAX_MARKS) marks.shift();
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[perf] ${name} +${at}ms`);
  }
}

/** All recorded marks, oldest first. */
export function getMarks(): PerfMark[] {
  return marks.map((entry) => ({ ...entry }));
}

/** Forgets the recorded marks. */
export function clearMarks(): void {
  marks.length = 0;
}

/** `840 ms` or `1.24 s`. */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}
