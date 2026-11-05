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
  listeners: Set<() => void>;
  /** Carried over from the in-memory entry and not yet saved. */
  unsaved: boolean;
}

const EMPTY: ReadonlySet<string> = new Set();
const entries = new Map<string, Entry>();
let store: KeyValueStore = safeStorage;

/** Test seam: swap the storage and forget every entry. Returns the previous store. */
export function setTreeExpansionStore(next: KeyValueStore | null): KeyValueStore {
  const prev = store;
  store = next ?? safeStorage;
  entries.clear();
  return prev;
}

function keyOf(repo: string | null, treeRef: string | null): string {
  return repo !== null && treeRef !== null ? `${repo}@${treeRef}` : `\u0000memory:${repo ?? ""}`;
}

function entryFor(repo: string | null, treeRef: string | null): Entry {
  const key = keyOf(repo, treeRef);
  let entry = entries.get(key);
  if (!entry) {
    const persisted = repo !== null && treeRef !== null;
    entry = {
      repo: repo ?? "",
      ref: persisted ? treeRef : null,
      set: persisted ? load(store, repo, treeRef) : EMPTY,
      listeners: new Set(),
      unsaved: false,
    };
    entries.set(key, entry);
  }
  if (repo !== null && treeRef !== null) carryOverMemory(repo, entry);
  return entry;
}

/**
 * Whenever a persisted key is active, folders opened while the ref was unknown join
 * its set (cached or freshly loaded), and the repo's memory entry goes, so they can
 * never reach a later branch.
 */
function carryOverMemory(repo: string, entry: Entry): void {
  const memoryKey = keyOf(repo, null);
  const memory = entries.get(memoryKey);
  if (!memory) return;
  entries.delete(memoryKey);
  const merged = new Set(Array.from(entry.set).concat(Array.from(memory.set)));
  if (merged.size !== entry.set.size) {
    entry.set = merged;
    entry.unsaved = true;
  }
}

/** Forget every entry (Disconnect). The stored key is removed by the caller. */
export function resetTreeExpansion(): void {
  entries.clear();
}

function commit(entry: Entry, next: ReadonlySet<string>): void {
  entry.set = next;
  if (entry.ref !== null) save(store, entry.repo, entry.ref, next);
  Array.from(entry.listeners).forEach((l) => l());
}

export interface TreeExpansionInput {
  repo: string | null;
  treeRef: string | null;
  selectedPath: string | null;
}

export function useTreeExpansion({ repo, treeRef, selectedPath }: TreeExpansionInput) {
  const subscribe = useCallback((listener: () => void) => {
    const entry = entryFor(repo, treeRef);
    entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }, [repo, treeRef]);
  const getSnapshot = useCallback(() => entryFor(repo, treeRef).set, [repo, treeRef]);
  const expanded = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  // Open the folders above the selected file when it, or the tree it sits in, changes.
  useEffect(() => {
    const entry = entryFor(repo, treeRef);
    const next = selectedPath ? reveal(entry.set, selectedPath) : entry.set;
    if (next.size !== entry.set.size || entry.unsaved) {
      entry.unsaved = false;
      commit(entry, next);
    }
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
