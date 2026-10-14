const ACTIVE_ATTRIBUTE = "data-mardoc-active-change";
const TEMP_TABINDEX = "data-mardoc-navigation-tabindex";
const STYLE_ID = "mardoc-html-diff-navigation-style";

/** Remove navigation state when leaving the diff preview. */
export function clearHtmlDiffNavigation(doc: Document): void {
  doc.querySelectorAll(`[${ACTIVE_ATTRIBUTE}]`).forEach(element => {
    element.removeAttribute(ACTIVE_ATTRIBUTE);
    if (element.hasAttribute(TEMP_TABINDEX)) {
      element.removeAttribute("tabindex");
      element.removeAttribute(TEMP_TABINDEX);
    }
  });
}

function isHidden(element: Element, doc: Document): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return true;
    const style = doc.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") return true;
  }
  return false;
}

/** Navigate by exact attribute values, including IDs containing CSS punctuation. */
export function navigateHtmlDiff(
  doc: Document,
  changes: Array<{ id: string }>,
  activeIndex: number,
  direction: "previous" | "next",
): number {
  if (!changes.length) {
    clearHtmlDiffNavigation(doc);
    return -1;
  }
  const markers = new Map<string, Element[]>();
  doc.querySelectorAll("[data-mardoc-change-id]").forEach(element => {
    const id = element.getAttribute("data-mardoc-change-id")!;
    markers.set(id, [...(markers.get(id) || []), element]);
  });
  const hasActive = Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < changes.length;
  const start = hasActive ? activeIndex : direction === "next" ? -1 : 0;
  const step = direction === "next" ? 1 : -1;
  for (let offset = 1; offset <= changes.length; offset++) {
    const index = ((start + step * offset) % changes.length + changes.length) % changes.length;
    const element = markers.get(changes[index].id)?.find(candidate => !isHidden(candidate, doc));
    if (!element) continue;
    // Closed disclosure widgets must be expanded before scrolling to their contents.
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName.toLowerCase() === "details") ancestor.setAttribute("open", "");
    }
    clearHtmlDiffNavigation(doc);
    element.setAttribute(ACTIVE_ATTRIBUTE, "true");
    if (!element.hasAttribute("tabindex")) {
      element.setAttribute("tabindex", "-1");
      element.setAttribute(TEMP_TABINDEX, "true");
    }
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `[${ACTIVE_ATTRIBUTE}="true"] { outline: 2px solid #2563eb !important; outline-offset: 3px; scroll-margin-block: 5rem; }`;
      (doc.head || doc.documentElement).appendChild(style);
    }
    const focusable = element as HTMLElement;
    focusable.focus?.({ preventScroll: true });
    const reducedMotion = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView?.({ behavior: reducedMotion ? "instant" : "smooth", block: "center" });
    return index;
  }
  clearHtmlDiffNavigation(doc);
  return -1;
}
