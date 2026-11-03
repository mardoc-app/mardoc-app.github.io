/**
 * Which folders of the repo tree are open. Pure: sets in, new sets out.
 * The caller reads and writes storage; `serialize` and `parse` are the text form.
 */

const MAX_FOLDERS = 200;

/** Opens every ancestor folder of a file. Paths under `__` and top-level files open nothing. */
export function reveal(state: ReadonlySet<string>, filePath: string): Set<string> {
  const next = new Set(state);
  if (filePath.startsWith("__")) return next;
  const segments = filePath.split("/");
  for (let i = 1; i < segments.length; i++) next.add(segments.slice(0, i).join("/"));
  return next;
}

export function toggle(state: ReadonlySet<string>, folderPath: string): Set<string> {
  const next = new Set(state);
  if (!next.delete(folderPath)) next.add(folderPath);
  return next;
}

export function collapseAll(_state: ReadonlySet<string>): Set<string> {
  return new Set();
}

export function serialize(state: ReadonlySet<string>): string {
  return JSON.stringify([...state].sort());
}

/** A JSON array's string items, sorted, first 200 kept; an empty set for anything else. */
export function parse(text: string): Set<string> {
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return new Set();
    const items = value.filter((x): x is string => typeof x === "string").sort();
    return new Set(items.slice(0, MAX_FOLDERS));
  } catch {
    return new Set();
  }
}
