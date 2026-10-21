import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * On-device PBKDF2 benchmark — triggered by typing 1337 on the calculator.
 * Measures the asyncTick-only effect (tick 10 vs 100 at small c) and a real
 * 210k/tick100 run, so iteration choices use measured numbers, not guesses.
 */
export async function runPbkdf2Bench(): Promise<void> {
  const salt = new Uint8Array(16);
  const password = 'bench-pin';
  const hasSchedulerYield = typeof (globalThis as { scheduler?: { yield?: unknown } }).scheduler?.yield === 'function';
  console.log(`[bench] start scheduler.yield=${hasSchedulerYield}`);

  const time = async (c: number, tick: number): Promise<number> => {
    const t0 = Date.now();
    await pbkdf2Async(sha256, password, salt, { c, dkLen: 64, asyncTick: tick });
    return Date.now() - t0;
  };

  const t20Tick10 = await time(20_000, 10);
  console.log(`[bench] asyncTick alone: c=20000 tick=10  -> ${t20Tick10}ms`);

  const t20Tick100 = await time(20_000, 100);
  console.log(`[bench] asyncTick alone: c=20000 tick=100 -> ${t20Tick100}ms (tick effect: ${t20Tick10 === 0 ? 'n/a' : `${Math.round((1 - t20Tick100 / t20Tick10) * 100)}%`})`);

  console.log(`[bench] projection from c=20000: 150k@tick100=${Math.round(t20Tick100 * 7.5)}ms  210k@tick100=${Math.round(t20Tick100 * 10.5)}ms  600k@tick100=${Math.round(t20Tick100 * 30)}ms`);

  const t210 = await time(210_000, 100);
  console.log(`[bench] REAL: c=210000 tick=100 -> ${t210}ms`);
  console.log('[bench] done');
}
