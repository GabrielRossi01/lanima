export interface PlatformInfo {
  userAgent: string;
  /** `navigator.maxTouchPoints` */
  maxTouchPoints: number;
}

/**
 * iPhone, iPod or iPad. iPadOS 13+ reports a desktop "Macintosh" user agent,
 * so a Mac UA with multi-touch is treated as an iPad.
 */
export function isIOSDevice({ userAgent, maxTouchPoints }: PlatformInfo): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Safari on iOS/iPadOS: the only browser there that can "Add to Home Screen"
 * as a standalone PWA for all iOS versions we target.
 * Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS) and in-app browsers are excluded.
 */
export function isIOSSafari(info: PlatformInfo): boolean {
  if (!isIOSDevice(info)) return false;
  const ua = info.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|Line\//.test(ua)) return false;
  return /Safari\//.test(ua) && /Version\//.test(ua);
}

export interface StandaloneSignals {
  displayModeStandalone: boolean;
  /** Legacy iOS `navigator.standalone`. */
  navigatorStandalone?: boolean;
}

export function isStandalone({ displayModeStandalone, navigatorStandalone }: StandaloneSignals): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export type InstallMode =
  /** Already running from the home screen. */
  | "installed"
  /** Android/desktop Chromium: a deferred `beforeinstallprompt` is available. */
  | "prompt"
  /** iOS/iPadOS Safari: show the manual "Compartilhar → Adicionar à Tela de Início" steps. */
  | "ios-manual"
  /** iOS but not Safari: tell her to open in Safari. */
  | "ios-other-browser"
  /** Nothing we can offer right now. */
  | "unavailable";

export function getInstallMode(
  info: PlatformInfo,
  standalone: StandaloneSignals,
  hasDeferredPrompt: boolean,
): InstallMode {
  if (isStandalone(standalone)) return "installed";
  if (hasDeferredPrompt) return "prompt";
  if (isIOSSafari(info)) return "ios-manual";
  if (isIOSDevice(info)) return "ios-other-browser";
  return "unavailable";
}
