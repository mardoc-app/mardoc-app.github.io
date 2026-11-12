/**
 * The address-bar adapter: the one routing file that touches `location` and
 * `history`. Everything else in routing/ is pure.
 *
 * It remembers the last hash the app knows about (published, restored, or
 * accepted from the user), so the hashchange that the app's own push fires
 * is not mistaken for user navigation, even when several pushes happen in
 * one turn of the event loop.
 */

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
