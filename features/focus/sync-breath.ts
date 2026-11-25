import { breathDelayMs } from "@/lib/focus/breath";

/** Ref: sets the phase right before the animation starts. */
export function syncBreath(el: HTMLElement | null) {
  if (el) el.style.animationDelay = `${breathDelayMs(performance.now())}ms`;
}
