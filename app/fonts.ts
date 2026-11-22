import { Caveat, DM_Sans, Fraunces } from "next/font/google";

/*
 * next/font downloads these at build time and serves them from the app's own origin
 * (/_next/static/media), so they work offline once the service worker caches them.
 */

/** Titles and the focus timer. Variable font: weights 300/400/600 are all in one file. */
export const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

/** Interface text: 400/500/600/700. */
export const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  variable: "--font-dm-sans",
  display: "swap",
});

/** Only for the handwriting sample in onboarding: not preloaded. */
export const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-caveat",
  display: "swap",
  preload: false,
});
