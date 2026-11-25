/** How many particles a device can take. Pure rules; the measuring is in use-particle-quality.ts. */
export const MIN_FPS = 50;
export const MEASURE_MS = 3000;
export const WEAK_CORES = 4;

interface Device {
  cores: number | undefined;
  /** iPad, iPhone or Mac: Safari caps the reported cores, so they say nothing there. */
  apple: boolean;
}

export function startsReduced({ cores, apple }: Device): boolean {
  return !apple && cores !== undefined && cores <= WEAK_CORES;
}

export function isApple(userAgent: string): boolean {
  return /iPad|iPhone|iPod|Macintosh/.test(userAgent);
}

export function averageFps(frames: number, ms: number): number {
  return ms > 0 ? (frames * 1000) / ms : 0;
}

/** Only after the whole window: a short sample says nothing. */
export function isTooSlow(frames: number, ms: number): boolean {
  return ms >= MEASURE_MS && averageFps(frames, ms) < MIN_FPS;
}
