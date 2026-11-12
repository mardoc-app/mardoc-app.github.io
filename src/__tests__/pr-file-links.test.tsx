/**
 * F-84 / F-85: a PR file link names the file by path. A cold link writes
 * nothing to the address bar until the PR files arrive, then replaces it
 * with the path form; a click on a file pushes the path form.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
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
  vi.mocked(api.fetchFileContent).mockImplementation(async (repo, path, ref) => `${repo}:${ref}:${path}`);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

async function start(hash: string) {
  localStorage.setItem("mardoc_github_token", "fake-test-token");
  window.history.replaceState(null, "", "/" + hash);
  render(<React.StrictMode><AppProvider><Probe /></AppProvider></React.StrictMode>);
  await waitFor(() => expect(state.isAuthenticated).toBe(true));
}
/** A link the user follows: the browser changes the address in place, then fires hashchange. */
async function follow(hash: string) {
  await act(async () => { window.history.replaceState(null, "", "/" + hash); window.dispatchEvent(new HashChangeEvent("hashchange")); });
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
    await start(link);
    replace.mockClear();
    const entries = window.history.length;
    await waitFor(() => expect(api.fetchPRFileManifest).toHaveBeenCalled());
    expect(state.selectedPR?.number).toBe(12);
    expect(location.hash).toBe(link);
    expect(replace).not.toHaveBeenCalled();
    expect(window.history.length).toBe(entries);
    await act(async () => manifest.resolve([prFile("docs/a.md"), prFile("docs/b.md")]));
    await waitFor(() => expect(state.prFiles).toHaveLength(2));
    expect(state.error).toBeNull();
    expect(location.hash).toBe(link.includes("files/0")
      ? "#/acme/docs/pull/12/file/docs/a.md"
      : link.replace(/\?.*/, "") + (link.includes("anchor") ? "?anchor=intro" : ""));
  });

  it("f84_resolve_replaces_rather_than_pushes", async () => {
    const manifest = deferred<any[]>();
    vi.mocked(api.fetchPRFileManifest).mockReturnValue(manifest.promise);
    await start("#/acme/docs/pull/12/files/1");
    await waitFor(() => expect(api.fetchPRFileManifest).toHaveBeenCalled());
    expect(location.hash).toBe("#/acme/docs/pull/12/files/1");
    const before = window.history.length;
    await act(async () => manifest.resolve([prFile("one.md"), prFile("docs/two words%.md")]));
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
    await start("#/acme/docs/pull/12/file/docs/gone.md");
    await waitFor(() => expect(state.prFiles).toHaveLength(2));
    expect(state.selectedPRFileIdx).toBe(0);
    expect(state.error).toBe("The linked file docs/gone.md is not in this PR.");
    expect(location.hash).toBe("#/acme/docs/pull/12/file/docs/gone.md");
  });

  it("f84_selecting_another_file_clears_only_the_linked_file_error", async () => {
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue([prFile("intro.md"), prFile("guide.md")]);
    await start("#/acme/docs/pull/12/file/gone.md");
    await waitFor(() => expect(state.error).toBe("The linked file gone.md is not in this PR."));
    await act(async () => state.setSelectedPRFileIdx(1));
    expect(state.error).toBeNull();
    expect(location.hash).toBe("#/acme/docs/pull/12/file/guide.md");
  });

  it("f84_selecting_another_file_keeps_other_errors", async () => {
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue([prFile("intro.md"), prFile("guide.md")]);
    vi.mocked(api.fetchPRComments).mockRejectedValue(new Error("comments unavailable"));
    await start("#/acme/docs/pull/12/file/intro.md");
    await waitFor(() => expect(state.error).toMatch(/comments unavailable/));
    const error = state.error;
    await act(async () => state.setSelectedPRFileIdx(1));
    expect(state.error).toBe(error);
  });

  it("f84_warm_link_to_the_open_pr_resolves_and_replaces", async () => {
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue([
      prFile("intro.md"), prFile("guide/new-name.md", "guide/old-name.md"), prFile("docs/c.md")]);
    await start("#/acme/docs/pull/12/file/intro.md");
    await waitFor(() => expect(state.prFiles).toHaveLength(3));
    const before = window.history.length;
    await follow("#/acme/docs/pull/12/files/2");
    expect(state.selectedPRFileIdx).toBe(2);
    expect(location.hash).toBe("#/acme/docs/pull/12/file/docs/c.md");
    expect(window.history.length).toBe(before);
    await follow("#/acme/docs/pull/12/file/guide/old-name.md");
    expect(state.selectedPRFileIdx).toBe(1);
    expect(location.hash).toBe("#/acme/docs/pull/12/file/guide/new-name.md");
    expect(window.history.length).toBe(before);
    await follow("#/acme/docs/pull/12/file/gone.md");
    expect(state.selectedPRFileIdx).toBe(0);
    expect(state.error).toBe("The linked file gone.md is not in this PR.");
    expect(location.hash).toBe("#/acme/docs/pull/12/file/gone.md");
    expect(api.fetchPRFileManifest).toHaveBeenCalledTimes(1);
  });

  it("f84_confirming_a_link_over_a_dirty_editor_shows_its_address", async () => {
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue([prFile("intro.md")]);
    await start("#/acme/docs/blob/main/spec.md");
    await waitFor(() => expect(state.fileContent).toContain("spec.md"));
    act(() => state.setEditorIsDirty(true));
    await follow("#/acme/docs/pull/12");
    expect(location.hash).toBe("#/acme/docs/blob/main/spec.md");
    await act(async () => { fireEvent.click(screen.getByText("Discard changes")); });
    await waitFor(() => expect(state.prFiles).toHaveLength(1));
    expect(state.selectedPR?.number).toBe(12);
    expect(location.hash).toBe("#/acme/docs/pull/12");
  });
});
