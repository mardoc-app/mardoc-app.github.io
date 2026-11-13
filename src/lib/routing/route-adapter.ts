/**
 * The address-bar adapter: the one routing file that touches `location` and
 * `history`. Everything else in routing/ is pure.
 *
 * It remembers the last hash the app knows about (published, restored, or
 * accepted from the user), so the hashchange that the app's own push fires
 * is not mistaken for user navigation, even when several pushes happen in
 * one turn of the event loop.
 */

import * as safeStorage from "../safe-storage";
import { parseMode, type ViewMode } from "./view-mode";

let known = "";

/** The current hash, including its leading `#` (empty when there is none). */
export function readLocation(): string {
  return window.location.hash;
}

function replaceHash(hash: string): void {
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", pathname + search + hash);
}

/**
 * Shows `hash` in the address bar. Push adds a history entry (Back returns
 * to the previous address); replace rewrites the current entry and fires no
 * hashchange.
 */
export function publish(hash: string, { replace = false }: { replace?: boolean } = {}): void {
  known = hash;
  if (replace) replaceHash(hash);
  else window.location.hash = hash;
}

/** Puts `hash` back in the current entry without navigating (for example, when a dirty editor holds the page). */
export function restore(hash: string): void {
  known = hash;
  replaceHash(hash);
}

/**
 * Calls `cb` for each hashchange the app did not cause, with the new hash and
 * the one the app last knew. Returns the unsubscribe function.
 */
export function onExternalChange(cb: (hash: string, previous: string) => void): () => void {
  known = readLocation();
  const listener = () => {
    const hash = readLocation();
    if (hash === known) return;
    const previous = known;
    known = hash;
    cb(hash, previous);
  };
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** Calls `cb` on every address change, the app's own included (hashchange and popstate). */
export function onAddressChange(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  window.addEventListener("popstate", cb);
  return () => { window.removeEventListener("hashchange", cb); window.removeEventListener("popstate", cb); };
}

/** Calls `cb` when the user moves through history (Back or Forward). */
export function onPopState(cb: () => void): () => void {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

/** Adds a history entry at the same address, with `marker` merged into its state, so Back can close a view. */
export function pushMarker(marker: Record<string, unknown>): void {
  window.history.pushState({ ...window.history.state, ...marker }, "");
}

/** Goes back one history entry. */
export function back(): void {
  window.history.back();
}

const MODE_KEY = "mardoc_view_mode";

/** The mode last picked by the user for a kind of file; undefined when none is stored or the stored value is unusable. */
export function loadMode(kind: "md" | "html"): ViewMode | undefined {
  try {
    const stored: unknown = JSON.parse(safeStorage.getItem(MODE_KEY) ?? "null");
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return undefined;
    const token = (stored as Record<string, unknown>)[kind];
    return typeof token === "string" ? parseMode(token) : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the mode the user picked for a kind of file; the other kind is kept. Never throws. */
export function saveMode(kind: "md" | "html", token: ViewMode): void {
  try {
    let stored: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(safeStorage.getItem(MODE_KEY) ?? "null");
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
    } catch { /* unreadable value: start again */ }
    safeStorage.setItem(MODE_KEY, JSON.stringify({ ...stored, [kind]: token }));
  } catch { /* not stored */ }
}

/** Sets (or, with undefined, removes) the `mode` query parameter of the current address, in place: no history entry, no hashchange. */
export function publishMode(token: ViewMode | undefined): void {
  const hash = readLocation();
  const at = hash.indexOf("?");
  const route = at < 0 ? hash : hash.slice(0, at);
  const params = new URLSearchParams(at < 0 ? "" : hash.slice(at + 1));
  if (token) params.set("mode", token);
  else params.delete("mode");
  const query = params.toString();
  const next = query ? `${route}?${query}` : route;
  if (next === hash) return;
  known = next;
  replaceHash(next);
}
