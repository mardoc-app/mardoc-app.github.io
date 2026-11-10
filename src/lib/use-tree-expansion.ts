/**
 * The open folders of the repo tree, shared by every mounted Sidebar (phones mount
 * two). One module-level entry per `owner/repo@ref` holds the set; each hook
 * instance subscribes to it, so all instances read and write the same set.
 *
 * While the tree's ref is unknown (`treeRef` null) the set lives in memory only:
 * nothing is read from or written to storage, so a guessed branch never owns state.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import * as safeStorage from "./safe-storage";
import { load, save, type KeyValueStore } from "./expansion-store";
import { reveal, toggle as toggleFolder, collapseAll as collapseAllFolders } from "./tree-expansion";

interface Entry {
  repo: string;
  /** null: in memory only. */
  ref: string | null;
  set: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();
const entries = new Map<string, Entry>();
/** One listener list for every entry, so a reset never strands a mounted tree. */
const listeners = new Set<() => void>();
let store: KeyValueStore = safeStorage;

function notify(): void {
  Array.from(listeners).forEach((l) => l());
}

/** Test seam: swap the storage and forget every entry. Returns the previous store. */
export function setTreeExpansionStore(next: KeyValueStore | null): KeyValueStore {
  const prev = store;
  store = next ?? safeStorage;
  entries.clear();
  notify();
  return prev;
}

function keyOf(repo: string | null, treeRef: string | null): string {
  return repo !== null && treeRef !== null ? `${repo}@${treeRef}` : `\u0000memory:${repo ?? ""}`;
}

/**
 * The entry for a repo and tree ref. A memory entry (ref unknown) is never merged
 * into a stored one: while the ref is unknown the tree shows a spinner, so only
 * reveals land there, and the reveal effect re-applies the selected file's folders
 * once the real ref arrives.
 */
function entryFor(repo: string | null, treeRef: string | null): Entry {
  const key = keyOf(repo, treeRef);
  let entry = entries.get(key);
  if (!entry) {
    const persisted = repo !== null && treeRef !== null;
    entry = {
      repo: repo ?? "",
      ref: persisted ? treeRef : null,
      set: persisted ? load(store, repo, treeRef) : EMPTY,
    };
    entries.set(key, entry);
  }
  return entry;
}

/** Forget every entry (Disconnect). The stored key is removed by the caller. */
export function resetTreeExpansion(): void {
  entries.clear();
  notify();
}

function commit(entry: Entry, next: ReadonlySet<string>): void {
  entry.set = next;
  if (entry.ref !== null) save(store, entry.repo, entry.ref, next);
  notify();
}

export interface TreeExpansionInput {
  repo: string | null;
  treeRef: string | null;
  selectedPath: string | null;
}

export function useTreeExpansion({ repo, treeRef, selectedPath }: TreeExpansionInput) {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const getSnapshot = useCallback(() => entryFor(repo, treeRef).set, [repo, treeRef]);
  const expanded = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  // Open the folders above the selected file when it, or the tree it sits in, changes.
  useEffect(() => {
    const entry = entryFor(repo, treeRef);
    const next = selectedPath ? reveal(entry.set, selectedPath) : entry.set;
    if (next.size !== entry.set.size) commit(entry, next);
  }, [repo, treeRef, selectedPath]);

  const toggle = useCallback((path: string) => {
    const entry = entryFor(repo, treeRef);
    commit(entry, toggleFolder(entry.set, path));
  }, [repo, treeRef]);
  const collapseAll = useCallback(() => {
    const entry = entryFor(repo, treeRef);
    commit(entry, collapseAllFolders(entry.set));
  }, [repo, treeRef]);

  return { expanded, toggle, collapseAll };
}
