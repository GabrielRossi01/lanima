/** Breathing of Deep Focus: 5 s in, 5 s out. */
export const BREATH_MS = 10_000;

/**
 * Delay that puts an animation in the common phase, whenever it is mounted: the glow and the text
 * come in at different moments (the text can be turned on later) and must breathe together.
 */
export function breathDelayMs(now: number): number {
  return -(now % BREATH_MS);
}
