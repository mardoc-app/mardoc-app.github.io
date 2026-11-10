import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "@/lib/app-context";
import { useTreeExpansion, setTreeExpansionStore } from "@/lib/use-tree-expansion";
import { EXPANSION_KEY } from "@/lib/expansion-store";
import * as api from "@/lib/github-api";
vi.mock("@/lib/github-api");

const MAIN = "a".repeat(40), FEATURE = "b".repeat(40);
let app: ReturnType<typeof useApp>;
let tree: ReturnType<typeof useTreeExpansion>;
let reads: string[], writes: string[], data: Map<string, string>;
const spy = {
  getItem: (k: string) => { reads.push(k); return data.get(k) ?? null; },
  setItem: (k: string, v: string) => { writes.push(k); data.set(k, v); },
};
// The Sidebar's own use of the hook: the repo and tree ref from app-context, the selected file's path.
function SidebarProbe() {
  app = useApp();
  tree = useTreeExpansion({ repo: app.currentRepo, treeRef: app.treeRef, selectedPath: app.selectedFile?.path ?? null });
  return null;
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const file = (path: string) => ({ id: path, name: path.split("/").pop()!, path, type: "file" as const });
const stored = () => JSON.parse(data.get(EXPANSION_KEY) ?? "{}");
const sorted = (s: ReadonlySet<string>) => Array.from(s).sort();

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); window.history.replaceState(null, "", "/");
  reads = []; writes = []; data = new Map(); setTreeExpansionStore(spy);
  vi.mocked(api.fetchDefaultBranch).mockResolvedValue("main");
  vi.mocked(api.fetchBranches).mockResolvedValue([]);
  vi.mocked(api.fetchPullRequests).mockResolvedValue([]);
  vi.mocked(api.fetchPRMarkdownCounts).mockResolvedValue(new Map());
  vi.mocked(api.fetchRevision).mockImplementation(async (_repo, ref) => (ref === "main" ? MAIN : FEATURE));
  vi.mocked(api.fetchRepoTree).mockResolvedValue([]);
  vi.mocked(api.fetchFileContent).mockResolvedValue("text");
});
afterEach(() => { cleanup(); setTreeExpansionStore(null); window.history.replaceState(null, "", "/"); });

async function start(hash: string) {
  localStorage.setItem("mardoc_github_token", "fake-test-token");
  window.history.replaceState(null, "", "/" + hash);
  render(<React.StrictMode><AppProvider><SidebarProbe /></AppProvider></React.StrictMode>);
  await waitFor(() => expect(app.isAuthenticated).toBe(true));
}
async function navigate(hash: string) {
  await act(async () => { window.history.replaceState(null, "", "/" + hash); window.dispatchEvent(new HashChangeEvent("hashchange")); });
}

describe("folder state through app-context", () => {
  it("f82_no_load_or_save_under_a_guessed_main", async () => {
    const def = deferred<string>();
    vi.mocked(api.fetchDefaultBranch).mockReturnValue(def.promise);
    await start("#/o/r");
    expect(app.selectedBranch).toBe("main"); // the guess
    act(() => tree.toggle("early"));
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
    await act(async () => def.resolve("dev"));
    await waitFor(() => expect(app.treeRef).toBe("dev"));
    // Nothing is stored for the guessed main, and the in-memory toggle is not
    // carried into dev (WP11R-7); dev starts from its own stored set.
    expect(sorted(tree.expanded)).toEqual([]);
    expect(Object.keys(stored()).some((k) => k.endsWith("@main"))).toBe(false);
  });

  it("f82_a_branch_switch_loads_its_own_set", async () => {
    await start("#/acme/docs/blob/main/top.md");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    act(() => tree.toggle("m"));
    act(() => app.setSelectedBranch("feature-x"));
    await waitFor(() => expect(app.treeRef).toBe("feature-x"));
    expect(sorted(tree.expanded)).toEqual([]);
    act(() => tree.toggle("f"));
    act(() => app.setSelectedBranch("main"));
    await waitFor(() => expect(app.treeRef).toBe("main"));
    expect(sorted(tree.expanded)).toEqual(["m"]);
    expect(stored()).toEqual({ "acme/docs@main": ["m"], "acme/docs@feature-x": ["f"] });
  });

  it("f82_a_link_to_another_branch_does_not_write_under_the_old_branch", async () => {
    await start("#/acme/docs/blob/main/top.md");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    const slow = deferred<any[]>();
    vi.mocked(api.fetchRepoTree).mockReturnValue(slow.promise);
    await navigate("#/acme/docs/blob/feature-x/a/b/c.md");
    await waitFor(() => expect(app.selectedBranch).toBe("feature-x"));
    expect(app.treeRef).toBeNull();
    expect(stored()["acme/docs@main"] ?? []).toEqual([]);
    await act(async () => slow.resolve([file("a/b/c.md")]));
    await waitFor(() => expect(app.treeRef).toBe("feature-x"));
    expect(stored()["acme/docs@feature-x"]).toEqual(["a", "a/b"]);
    expect(stored()["acme/docs@main"] ?? []).toEqual([]);
  });

  it("f82_folders_opened_before_a_cached_ref_resolves_do_not_leak_to_the_next_branch", async () => {
    await start("#/acme/docs/tree/main");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    await navigate("#/acme/other/tree/main");
    await waitFor(() => expect(app.currentRepo).toBe("acme/other"));
    await waitFor(() => expect(app.treeRef).toBe("main"));
    const slow = deferred<any[]>();
    vi.mocked(api.fetchRepoTree).mockReturnValue(slow.promise);
    await navigate("#/acme/docs/blob/main/x/y/z.md");
    await waitFor(() => expect(app.currentRepo).toBe("acme/docs"));
    expect(app.treeRef).toBeNull();
    await act(async () => slow.resolve([file("x/y/z.md")]));
    await waitFor(() => expect(app.treeRef).toBe("main"));
    expect(sorted(tree.expanded)).toEqual(["x", "x/y"]);
    vi.mocked(api.fetchRepoTree).mockResolvedValue([]);
    act(() => app.setSelectedBranch("feature-x"));
    await waitFor(() => expect(app.treeRef).toBe("feature-x"));
    expect(sorted(tree.expanded)).toEqual([]);
    expect(stored()["acme/docs@feature-x"] ?? []).toEqual([]);
    expect(stored()["acme/docs@main"]).toEqual(["x", "x/y"]);
  });

  it("f82_back_before_the_new_tree_arrives_keeps_the_old_branch_clean", async () => {
    // WP11R-7 (A)
    await start("#/acme/docs/blob/main/top.md");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    const slow = deferred<any[]>();
    vi.mocked(api.fetchRepoTree).mockReturnValue(slow.promise);
    await navigate("#/acme/docs/blob/feature-x/a/b/c.md");
    await waitFor(() => expect(app.selectedBranch).toBe("feature-x"));
    vi.mocked(api.fetchRepoTree).mockResolvedValue([file("top.md")]);
    await navigate("#/acme/docs/blob/main/top.md");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    await act(async () => slow.resolve([file("a/b/c.md")]));
    expect(sorted(tree.expanded)).toEqual([]);
    expect(stored()["acme/docs@main"] ?? []).toEqual([]);
  });

  it("f82_a_failed_refresh_does_not_leak_into_the_next_branch", async () => {
    // WP11R-7 (C)
    await start("#/acme/docs/blob/main/docs/top.md");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    vi.mocked(api.fetchRepoTree).mockRejectedValueOnce(new Error("boom"));
    await act(async () => { await app.refreshRepo(); });
    expect(app.treeRef).toBeNull();
    vi.mocked(api.fetchRepoTree).mockResolvedValue([]);
    act(() => app.setSelectedBranch("feature-x"));
    await waitFor(() => expect(app.treeRef).toBe("feature-x"));
    expect(sorted(tree.expanded)).toEqual([]);
    expect(stored()["acme/docs@feature-x"] ?? []).toEqual([]);
  });
});

describe("Disconnect and folder state", () => {
  it("f82_disconnect_removes_folder_state", async () => {
    setTreeExpansionStore(null); // production store: localStorage through safe-storage
    await start("#/acme/docs/blob/main/a/top.md");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    act(() => tree.toggle("keep"));
    expect(JSON.parse(localStorage.getItem(EXPANSION_KEY)!)["acme/docs@main"]).toContain("keep");
    await act(async () => app.setGithubToken(null));
    expect(localStorage.getItem(EXPANSION_KEY)).toBeNull();
    await act(async () => app.setGithubToken("fake-test-token"));
    await navigate("#/acme/docs/blob/main/a/top.md");
    await waitFor(() => expect(app.treeRef).toBe("main"));
    expect(sorted(tree.expanded)).toEqual(["a"]);
  });
});
