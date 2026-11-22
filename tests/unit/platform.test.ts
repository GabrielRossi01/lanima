import { describe, expect, it } from "vitest";
import { getInstallMode, isIOSDevice, isIOSSafari, isStandalone } from "@/lib/pwa/platform";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ pretends to be a Mac.
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  galaxyTabChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  instagramIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
};

const notStandalone = { displayModeStandalone: false };

describe("isIOSDevice", () => {
  it("reconhece iPhone e iPad (que se apresenta como Mac com toque)", () => {
    expect(isIOSDevice({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe(true);
    expect(isIOSDevice({ userAgent: UA.ipadSafari, maxTouchPoints: 5 })).toBe(true);
  });

  it("não confunde Mac de verdade nem Android", () => {
    expect(isIOSDevice({ userAgent: UA.macSafari, maxTouchPoints: 0 })).toBe(false);
    expect(isIOSDevice({ userAgent: UA.galaxyTabChrome, maxTouchPoints: 10 })).toBe(false);
  });
});

describe("isIOSSafari", () => {
  it("aceita só o Safari", () => {
    expect(isIOSSafari({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe(true);
    expect(isIOSSafari({ userAgent: UA.ipadSafari, maxTouchPoints: 5 })).toBe(true);
    expect(isIOSSafari({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe(false);
    expect(isIOSSafari({ userAgent: UA.instagramIOS, maxTouchPoints: 5 })).toBe(false);
  });
});

describe("isStandalone", () => {
  it("usa display-mode e o navigator.standalone legado do iOS", () => {
    expect(isStandalone({ displayModeStandalone: true })).toBe(true);
    expect(isStandalone({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true);
    expect(isStandalone({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false);
  });
});

describe("getInstallMode", () => {
  it("não oferece instalação se o app já está instalado", () => {
    expect(
      getInstallMode({ userAgent: UA.galaxyTabChrome, maxTouchPoints: 10 }, { displayModeStandalone: true }, true),
    ).toBe("installed");
  });

  it("Galaxy Tab com beforeinstallprompt usa o prompt nativo", () => {
    expect(getInstallMode({ userAgent: UA.galaxyTabChrome, maxTouchPoints: 10 }, notStandalone, true)).toBe("prompt");
  });

  it("iPad no Safari mostra o passo a passo", () => {
    expect(getInstallMode({ userAgent: UA.ipadSafari, maxTouchPoints: 5 }, notStandalone, false)).toBe("ios-manual");
  });

  it("Chrome no iPhone pede para abrir no Safari", () => {
    expect(getInstallMode({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 }, notStandalone, false)).toBe(
      "ios-other-browser",
    );
  });

  it("sem prompt e fora do iOS não mostra nada", () => {
    expect(getInstallMode({ userAgent: UA.galaxyTabChrome, maxTouchPoints: 10 }, notStandalone, false)).toBe(
      "unavailable",
    );
  });
});
