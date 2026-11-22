export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "lanima:theme";
export const THEME_CHANGE_EVENT = "lanima:themechange";

/** `--bg` of each theme, used for `<meta name="theme-color">`. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#F5F6F5",
  dark: "#12181D",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/**
 * Inline script that runs in <head> before first paint, so the theme never flashes.
 * It is also the only place that captures `beforeinstallprompt`, because that event
 * can fire before React hydrates.
 * Keep it dependency-free and small: it is serialized as a string.
 */
export function themeBootScript(): string {
  return `(function(){try{
var K=${JSON.stringify(THEME_STORAGE_KEY)},C=${JSON.stringify(THEME_COLORS)};
var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");
function pref(){var p=null;try{p=localStorage.getItem(K)}catch(e){}return p==="light"||p==="dark"?p:"system"}
function metas(){var t=d.getAttribute("data-theme")||"light",ms=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<ms.length;i++){if(ms[i].getAttribute("content")!==C[t])ms[i].setAttribute("content",C[t]);ms[i].removeAttribute("media")}}
function apply(){var p=pref(),t=p==="system"?(m.matches?"dark":"light"):p;d.setAttribute("data-theme",t);d.setAttribute("data-theme-preference",p);metas()}
apply();window.__lanimaApplyTheme=apply;
document.addEventListener("DOMContentLoaded",function(){apply();new MutationObserver(metas).observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:["content"]})});
if(m.addEventListener)m.addEventListener("change",function(){if(pref()==="system")apply()});
window.addEventListener("storage",function(e){if(e.key===K)apply()});
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__lanimaInstallEvent=e;window.dispatchEvent(new Event("lanima:installavailable"))});
window.addEventListener("appinstalled",function(){window.__lanimaInstallEvent=null;window.dispatchEvent(new Event("lanima:installavailable"))});
}catch(e){}})();`;
}
