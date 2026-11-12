/**
 * F-84 / F-85: a PR file link names the file by path. A cold link writes
 * nothing to the address bar until the PR files arrive, then replaces it
 * with the path form; a click on a file pushes the path form.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "@/lib/app-context";
import * as api from "@/lib/github-api";
vi.mock("@/lib/github-api");

let state: ReturnType<typeof useApp>;
function Probe() { state = useApp(); return null; }
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const prFile = (path: string, basePath = path) =>
  ({ path, basePath, baseContent: "", headContent: "", status: "modified", loadState: "pending" }) as any;

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); window.history.replaceState(null, "", "/");
  vi.mocked(api.fetchDefaultBranch).mockResolvedValue("main");
  vi.mocked(api.fetchBranches).mockResolvedValue([]);
  vi.mocked(api.fetchPullRequests).mockResolvedValue([]);
  vi.mocked(api.fetchPRMarkdownCounts).mockResolvedValue(new Map());
  vi.mocked(api.fetchRevision).mockResolvedValue("a".repeat(40));
  vi.mocked(api.fetchRepoTree).mockResolvedValue([]);
  vi.mocked(api.fetchPullRequest).mockResolvedValue({ number: 12, headBranch: "topic", files: [], comments: [] } as any);
  vi.mocked(api.fetchPRComments).mockResolvedValue([]);
  vi.mocked(api.fetchPRFile).mockImplementation(async file => ({ ...file, headContent: "loaded", loadState: "ready" }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

async function start(hash: string) {
  localStorage.setItem("mardoc_github_token", "fake-test-token");
  window.history.replaceState(null, "", "/" + hash);
  render(<React.StrictMode><AppProvider><Probe /></AppProvider></React.StrictMode>);
  await waitFor(() => expect(state.isAuthenticated).toBe(true));
}

describe("PR file links by path", () => {
  it.each([
    "#/acme/docs/pull/12/file/docs/b.md",
    "#/acme/docs/pull/12/files/0",
    "#/acme/docs/pull/12/file/docs/b.md?anchor=intro",
  ])("f84_no_hash_write_before_the_manifest (%s)", async link => {
    const manifest = deferred<any[]>();
    vi.mocked(api.fetchPRFileManifest).mockReturnValue(manifest.promise);
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    await start(link);
    replace.mockClear();
    await waitFor(() => expect(api.fetchPRFileManifest).toHaveBeenCalled());
    expect(state.selectedPR?.number).toBe(12);
    expect(location.hash).toBe(link);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    await act(async () => manifest.resolve([prFile("docs/a.md"), prFile("docs/b.md")]));
    await waitFor(() => expect(state.prFiles).toHaveLength(2));
    expect(state.error).toBeNull();
    expect(location.hash).toBe(link.includes("files/0")
      ? "#/acme/docs/pull/12/file/docs/a.md"
      : link.replace(/\?.*/, "") + (link.includes("anchor") ? "?anchor=intro" : ""));
  });

  it("f84_resolve_replaces_rather_than_pushes", async () => {
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue([prFile("one.md"), prFile("docs/two words%.md")]);
    await start("#/acme/docs/pull/12/files/1");
    const before = window.history.length;
    await waitFor(() => expect(location.hash).toBe("#/acme/docs/pull/12/file/docs/two%20words%25.md"));
    expect(state.selectedPRFileIdx).toBe(1);
    expect(window.history.length).toBe(before);
    await act(async () => state.setSelectedPRFileIdx(0));
    expect(location.hash).toBe("#/acme/docs/pull/12/file/one.md");
    expect(window.history.length).toBe(before + 1);
  });

  it("f84_renamed_file_matches_its_base_path", async () => {
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue([prFile("intro.md"), prFile("guide/new-name.md", "guide/old-name.md")]);
    await start("#/acme/docs/pull/12/file/guide/old-name.md");
    await waitFor(() => expect(state.prFiles).toHaveLength(2));
    expect(state.selectedPRFileIdx).toBe(1);
    expect(state.error).toBeNull();
    await waitFor(() => expect(location.hash).toBe("#/acme/docs/pull/12/file/guide/new-name.md"));
  });

  it("f84_missing_path_opens_the_first_file_with_a_message", async () => {
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue([prFile("intro.md"), prFile("guide.md")]);
    await start("#/acme/docs/pull/12/file/gone.md");
    await waitFor(() => expect(state.prFiles).toHaveLength(2));
    expect(state.selectedPRFileIdx).toBe(0);
    expect(state.error).toBe("The linked file is not in this PR.");
    expect(location.hash).toBe("#/acme/docs/pull/12/file/intro.md");
  });
});
