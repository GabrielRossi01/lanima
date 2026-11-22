/**
 * Runs in the page. Measures horizontal page scroll and, when there is any, lists the elements whose
 * right edge passes the layout viewport, so the CI log names the culprit (WebKit can't run on the dev
 * machine). Elements clipped by an ancestor that scrolls or hides overflow, and fixed elements, are
 * skipped: they don't scroll the page. "Origem" marks elements whose parent still fits, i.e. where the overflow starts.
 */
export function describeHorizontalOverflow() {
  // Not window.innerWidth: in Chromium's mobile emulation it grows with the content (412 → 655 px
  // with a 600 px element), so it could never detect overflow there. The layout viewport stays fixed.
  const viewport = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth - viewport;
  if (overflow <= 0) return { overflow, report: "" };

  // Clipped by a scrolling/hidden ancestor, or inside a fixed box (fixed boxes never scroll the page;
  // a full-width one only looks wide because it follows the overflowing viewport).
  const ignored = (el: Element) => {
    if (getComputedStyle(el).position === "fixed") return true;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (style.overflowX !== "visible" || style.position === "fixed") return true;
    }
    return false;
  };
  const passes = (el: Element | null) => !!el && el.getBoundingClientRect().right > viewport + 0.5;

  const offenders = Array.from(document.body.querySelectorAll("*")).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.right > viewport + 0.5 && !ignored(el);
  });
  const describe = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const classes = typeof el.className === "string" ? el.className.trim().replace(/\s+/g, ".") : "";
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const origin = passes(el.parentElement) ? "" : "[origem] ";
    return `${origin}<${el.tagName.toLowerCase()}${classes ? "." + classes : ""}> largura ${Math.round(rect.width)}px, direita ${Math.round(rect.right)}px${text ? `, texto "${text}"` : ""}`;
  };
  // Origins first: they are where the fix goes.
  const sorted = [
    ...offenders.filter((el) => !passes(el.parentElement)),
    ...offenders.filter((el) => passes(el.parentElement)),
  ];
  const lines = sorted.slice(0, 20).map((el) => `  - ${describe(el)}`);
  const more = sorted.length > 20 ? `\n  … e mais ${sorted.length - 20}` : "";
  return {
    overflow,
    report: `\nTela de ${viewport}px. Elementos que passam da borda direita (${sorted.length}):\n${lines.join("\n")}${more}`,
  };
}
