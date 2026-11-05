/**
 * Remembers which folders are open, per repository and ref. The storage is a
 * parameter, so this file touches no browser global. One key holds a JSON
 * object `{"owner/repo@ref": [paths...]}`, newest entry last, 20 entries at most.
 * Per-entry rules (200 paths, strings only) come from `tree-expansion`.
 */
import { parse, serialize } from "./tree-expansion";

export const EXPANSION_KEY = "mardoc_tree_expansion";
const MAX_ENTRIES = 20;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function entryKey(repo: string, ref: string): string {
  return `${repo}@${ref}`;
}

/** The stored entries in insertion order (oldest first); {} for anything unreadable. */
function readAll(store: KeyValueStore): Record<string, unknown> {
  try {
    const text = store.getItem(EXPANSION_KEY);
    if (text === null) return {};
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function load(store: KeyValueStore, repo: string, ref: string): Set<string> {
  try {
    const entry = readAll(store)[entryKey(repo, ref)];
    if (!Array.isArray(entry)) return new Set();
    return parse(JSON.stringify(entry));
  } catch {
    return new Set();
  }
}

export function save(store: KeyValueStore, repo: string, ref: string, set: ReadonlySet<string>): void {
  try {
    const key = entryKey(repo, ref);
    const entries: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(readAll(store))) {
      if (k !== key && Array.isArray(v)) entries[k] = Array.from(parse(JSON.stringify(v)));
    }
    entries[key] = Array.from(parse(serialize(set)));
    const keys = Object.keys(entries);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete entries[old];
    store.setItem(EXPANSION_KEY, JSON.stringify(entries));
  } catch {
    // Storage is best effort: a failed save loses a remembered state, nothing more.
  }
}
