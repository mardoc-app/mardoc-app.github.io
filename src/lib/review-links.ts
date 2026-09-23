import { resolvePath } from "./link-handler";

export type ReviewLink = { type: "anchor"; anchor: string } | { type: "external"; href: string }
  | { type: "document"; path: string; anchor: string } | { type: "blocked" };

/** Resolve original hrefs, never iframe-expanded localhost/mardoc URLs. */
export function resolveReviewLink(filePath: string, href: string): ReviewLink {
  const value = href.trim();
  if (!value) return { type: "blocked" };
  if (/^(https?:|mailto:|tel:)/i.test(value)) return { type: "external", href: value };
  if (value.startsWith("//")) return { type: "external", href: `https:${value}` };
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.includes("\\")) return { type: "blocked" };
  try {
    const hash = value.indexOf("#");
    const anchor = hash < 0 ? "" : decodeURIComponent(value.slice(hash + 1));
    const pathname = (hash < 0 ? value : value.slice(0, hash)).split("?")[0];
    if (!pathname) return { type: "anchor", anchor };
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes("\\") || decoded.includes("\0")) return { type: "blocked" };
    const path = resolvePath(decoded.startsWith("/") ? "" : filePath, decoded.replace(/^\/+/, ""));
    return { type: "document", path, anchor };
  } catch { return { type: "blocked" }; }
}

export function scrollToDocumentAnchor(root: ParentNode, anchor: string): boolean {
  if (!anchor) return false;
  const target = Array.from(root.querySelectorAll<HTMLElement>("[id], a[name]"))
    .find(el => el.id === anchor || el.getAttribute("name") === anchor);
  target?.scrollIntoView({ block: "start" });
  return !!target;
}

/** Bind to the actual iframe document; no untrusted window messages are used. */
export function bindHtmlReviewLinks(doc: Document, navigate: (href: string) => void,
  hrefFor: (href: string) => string | undefined): () => void {
  const originals = new WeakMap<HTMLAnchorElement, { original: string; rewritten: string }>();
  const anchorFor = (event: Event) => {
    const target = event.target as Element | null;
    return target?.closest?.("a[href]") as HTMLAnchorElement | null;
  };
  const originalHref = (anchor: HTMLAnchorElement) => {
    const current = anchor.getAttribute("href") || "";
    const stored = originals.get(anchor);
    return stored && stored.rewritten === current ? stored.original : current;
  };
  const showDestination = (event: Event) => {
    const anchor = anchorFor(event);
    if (!anchor) return;
    const original = originalHref(anchor);
    const rewritten = hrefFor(original);
    if (rewritten) {
      originals.set(anchor, { original, rewritten });
      if (anchor.getAttribute("href") !== rewritten) anchor.setAttribute("href", rewritten);
    }
  };
  const click = (event: Event) => {
    if ("button" in event && (event as MouseEvent).button > 1) return;
    const anchor = anchorFor(event);
    if (!anchor) return;
    const href = originalHref(anchor);
    // Leave slide-local anchors to the deck's own controls/router.
    if (href.trim().startsWith("#")) {
      try {
        const id = decodeURIComponent(href.trim().slice(1));
        if (doc.getElementById(id)) { event.preventDefault(); scrollToDocumentAnchor(doc, id); }
      } catch { event.preventDefault(); }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(href);
  };
  doc.addEventListener("click", click, true);
  doc.addEventListener("auxclick", click, true);
  doc.addEventListener("mouseover", showDestination, true);
  doc.addEventListener("focusin", showDestination, true);
  return () => {
    doc.removeEventListener("click", click, true);
    doc.removeEventListener("auxclick", click, true);
    doc.removeEventListener("mouseover", showDestination, true);
    doc.removeEventListener("focusin", showDestination, true);
  };
}
