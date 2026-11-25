/**
 * Deterministic particles of the focus themes: same seed, same output. Each list is generated whole
 * and cut, so the reduced version is the first half of the full one, in the same places.
 */

/** mulberry32: small, fast, good enough for decoration. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function countFor(full: number, reduced: boolean): number {
  return reduced ? Math.ceil(full / 2) : full;
}

function generate<T>(full: number, reduced: boolean, seed: number, make: (between: Between) => T): T[] {
  const random = seededRandom(seed);
  const between: Between = (min, max, digits = 2) => Number((min + random() * (max - min)).toFixed(digits));
  return Array.from({ length: full }, () => make(between)).slice(0, countFor(full, reduced));
}

type Between = (min: number, max: number, digits?: number) => number;

export const COUNTS = { drops: 110, windowDrops: 14, ripples: 10, dust: 34, stars: 40 } as const;

/** Seconds. A negative delay starts the animation already under way. */
interface Timing {
  duration: number;
  delay: number;
}

function timing(between: Between, min: number, max: number): Timing {
  const duration = between(min, max);
  return { duration, delay: -between(0, duration) };
}

export interface RainDrop extends Timing {
  /** % */
  left: number;
  height: number;
  alpha: number;
}

export function rainDrops(reduced: boolean, seed = 1): RainDrop[] {
  return generate(COUNTS.drops, reduced, seed, (between) => ({
    left: between(0, 100),
    height: between(50, 120, 0),
    alpha: between(0.25, 0.65),
    ...timing(between, 0.55, 1.05),
  }));
}

export interface WindowDrop extends Timing {
  left: number;
  top: number;
  size: number;
}

export function windowDrops(reduced: boolean, seed = 2): WindowDrop[] {
  return generate(COUNTS.windowDrops, reduced, seed, (between) => ({
    left: between(0, 96, 1),
    top: between(0, 70, 1),
    size: between(8, 26, 0),
    ...timing(between, 10, 20),
  }));
}

export interface Ripple extends Timing {
  left: number;
  top: number;
}

export function ripples(reduced: boolean, seed = 3): Ripple[] {
  return generate(COUNTS.ripples, reduced, seed, (between) => ({
    left: between(4, 94, 1),
    top: between(88, 97, 1),
    ...timing(between, 1.8, 2.8),
  }));
}
