import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, waitFor, screen, fireEvent } from "@testing-library/react";
import { AppProvider, useApp } from "@/lib/app-context";
import * as api from "@/lib/github-api";
vi.mock("@/lib/github-api");
const MAIN = "a".repeat(40), FEATURE = "b".repeat(40), NEW = "c".repeat(40);
let state: ReturnType<typeof useApp>;
function Probe() { state = useApp(); return null; }
function deferred<T>() { let resolve!: (v:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; }
const file = (path: string) => ({ id:path, name:path.split("/").pop()!, path, type:"file" as const });
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); window.history.replaceState(null,"","/");
  vi.mocked(api.fetchDefaultBranch).mockResolvedValue("main");
  vi.mocked(api.fetchBranches).mockResolvedValue([]);
  vi.mocked(api.fetchPullRequests).mockResolvedValue([]);
  vi.mocked(api.fetchPRMarkdownCounts).mockResolvedValue(new Map());
  vi.mocked(api.fetchRevision).mockImplementation(async (_repo,ref)=>ref==="main" ? MAIN : FEATURE);
  vi.mocked(api.fetchRepoTree).mockResolvedValue([]);
  vi.mocked(api.fetchFileContent).mockImplementation(async(repo,path,ref)=>`${repo}:${ref}:${path}`);
});
afterEach(()=>{cleanup();window.history.replaceState(null,"","/");});
async function start(hash="") {
  localStorage.setItem("mardoc_github_token","fake-test-token");
  window.history.replaceState(null,"","/"+hash);
  render(<React.StrictMode><AppProvider><Probe/></AppProvider></React.StrictMode>);
  await waitFor(()=>expect(state.isAuthenticated).toBe(true));
}
async function navigate(hash:string) {
  await act(async()=>{window.history.replaceState(null,"","/"+hash);window.dispatchEvent(new HashChangeEvent("hashchange"));});
}
describe("authenticated branch links",()=>{
  it("loads a cold slash-branch link before slow repository enumeration completes",async()=>{
    const slow=deferred<any[]>();
    vi.mocked(api.fetchBranches).mockReturnValue(slow.promise);
    vi.mocked(api.fetchPullRequests).mockReturnValue(slow.promise);
    const hash="#/acme/docs/blob/feature%2Freport/docs/spec.md";
    await start(hash);
    await waitFor(()=>expect(state.fileRevision).toBe(FEATURE));
    expect(api.fetchFileContent).toHaveBeenCalledTimes(1);
    expect(api.fetchFileContent).toHaveBeenCalledWith("acme/docs","docs/spec.md",FEATURE,expect.any(AbortSignal));
    expect(state.selectedBranch).toBe("feature/report");
    expect(location.hash).toBe(hash);
    expect(api.fetchDefaultBranch).not.toHaveBeenCalled();
  });
  it("switches a warm link without reading the old branch or replaying on list updates",async()=>{
    await start("#/acme/docs/blob/main/same.md");
    await waitFor(()=>expect(state.fileRevision).toBe(MAIN));
    vi.mocked(api.fetchFileContent).mockClear();
    await navigate("#/acme/docs/blob/feature-x/same.md");
    await waitFor(()=>expect(state.fileRevision).toBe(FEATURE));
    expect(api.fetchFileContent).toHaveBeenCalledExactlyOnceWith("acme/docs","same.md",FEATURE,expect.any(AbortSignal));
    expect(location.hash).toBe("#/acme/docs/blob/feature-x/same.md");
    expect(state.selectedBranch).toBe("feature-x");
  });
  it("uses the link repository rather than the previously selected repository",async()=>{
    await start("#/acme/one/blob/main/same.md");
    await waitFor(()=>expect(state.fileRevision).toBe(MAIN));
    await navigate("#/acme/two/blob/topic/same.md");
    await waitFor(()=>expect(state.fileContent).toBe(`acme/two:${FEATURE}:same.md`));
    expect(state.currentRepo).toBe("acme/two");
  });
  it("discards late tree and file results after a branch switch",async()=>{
    await start("#/acme/docs/tree/main");
    await waitFor(()=>expect(api.fetchRepoTree).toHaveBeenCalled());
    const oldTree=deferred<any[]>(), oldFile=deferred<string>();
    vi.mocked(api.fetchRepoTree).mockImplementation(async(_repo,ref)=>ref===MAIN?oldTree.promise:[file("feature.md")]);
    vi.mocked(api.fetchFileContent).mockReturnValue(oldFile.promise);
    act(()=>{void state.openFile(file("old.md"));});
    await waitFor(()=>expect(api.fetchFileContent).toHaveBeenCalled());
    const oldSignal = vi.mocked(api.fetchFileContent).mock.calls.at(-1)![3]!;
    const treeSignal = vi.mocked(api.fetchRepoTree).mock.calls.at(-1)![2]!;
    act(()=>state.setSelectedBranch("feature-x"));
    expect(oldSignal.aborted).toBe(true);
    expect(treeSignal.aborted).toBe(true);
    await waitFor(()=>expect(state.repoFiles[0]?.path).toBe("feature.md"));
    await act(async()=>{oldTree.resolve([file("old.md")]);oldFile.resolve("STALE");});
    expect(state.selectedBranch).toBe("feature-x");
    expect(state.repoFiles[0].path).toBe("feature.md");
    expect(state.fileContent).toBe("");
    expect(state.selectedFile).toBeNull();
  });
  it("refreshes a moving branch, preserving its URL and using the new snapshot",async()=>{
    await start("#/acme/docs/blob/feature-x/spec.md");
    await waitFor(()=>expect(state.fileRevision).toBe(FEATURE));
    vi.mocked(api.fetchRevision).mockResolvedValue(NEW);
    act(()=>state.refreshDocument());
    await waitFor(()=>expect(state.fileRevision).toBe(NEW));
    expect(api.fetchFileContent).toHaveBeenLastCalledWith("acme/docs","spec.md",NEW,expect.any(AbortSignal));
    expect(location.hash).toBe("#/acme/docs/blob/feature-x/spec.md");
  });
  it("keeps dirty content and its route when a history navigation is canceled",async()=>{
    await start("#/acme/docs/blob/main/spec.md");
    await waitFor(()=>expect(state.fileRevision).toBe(MAIN));
    act(()=>state.setEditorIsDirty(true));
    await navigate("#/acme/docs/blob/feature-x/spec.md");
    expect(screen.getByText("Discard unsaved changes?")).toBeTruthy();
    fireEvent.click(screen.getByText("Keep editing"));
    expect(state.fileRevision).toBe(MAIN);
    expect(location.hash).toBe("#/acme/docs/blob/main/spec.md");
    expect(api.fetchFileContent).toHaveBeenCalledTimes(1);
  });
  it("resumes the original shared link after connecting",async()=>{
    window.history.replaceState(null,"","/#/acme/docs/blob/topic/unique.md");
    render(<AppProvider><Probe/></AppProvider>);
    await act(async()=>{state.setGithubToken("fake-test-token");});
    await waitFor(()=>expect(state.fileRevision).toBe(FEATURE));
    expect(api.fetchFileContent).toHaveBeenCalledWith("acme/docs","unique.md",FEATURE,expect.any(AbortSignal));
  });
  it("does not reload the editor when sidebar metadata is refreshed after a write",async()=>{
    await start("#/acme/docs/blob/topic/spec.md");
    await waitFor(()=>expect(state.fileRevision).toBe(FEATURE));
    await act(async()=>{await state.refreshRepo();});
    expect(api.fetchFileContent).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe("#/acme/docs/blob/topic/spec.md");
  });
});


describe("PR demand loading", () => {
  it("aborts pending PR metadata and comments when opening a document", async () => {
    const manifest = deferred<any[]>(), comments = deferred<any[]>();
    vi.mocked(api.fetchPullRequest).mockResolvedValue({number:12,headBranch:"topic"} as any);
    vi.mocked(api.fetchPRFileManifest).mockReturnValue(manifest.promise);
    vi.mocked(api.fetchPRComments).mockReturnValue(comments.promise);
    await start("#/acme/docs/pull/12");
    await waitFor(() => expect(api.fetchPRFileManifest).toHaveBeenCalled());
    const manifestSignal = vi.mocked(api.fetchPRFileManifest).mock.calls.at(-1)![2]!;
    const commentsSignal = vi.mocked(api.fetchPRComments).mock.calls.at(-1)![2]!;
    await navigate("#/acme/docs/blob/main/current.md");
    expect(manifestSignal.aborted).toBe(true);
    expect(commentsSignal.aborted).toBe(true);
    await waitFor(() => expect(state.fileRevision).toBe(MAIN));
    await act(async () => { manifest.resolve([]); comments.resolve([]); });
    expect(state.error).toBeNull();
    expect(state.selectedFile?.path).toBe("current.md");
  });

  it("loads only the linked document while comments remain pending and caches visited files", async () => {
    const comments = deferred<any[]>();
    const pr = { number: 12, headBranch: "topic", files: [], comments: [] } as any;
    const files = ["one.md", "two.html", "three.md"].map(path => ({path, baseContent:"", headContent:"", status:"added", loadState:"pending"})) as any;
    vi.mocked(api.fetchPullRequest).mockResolvedValue(pr);
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue(files);
    vi.mocked(api.fetchPRComments).mockReturnValue(comments.promise);
    vi.mocked(api.fetchPRFile).mockImplementation(async file => ({...file,headContent:"loaded",loadState:"ready"}));
    await start("#/acme/docs/pull/12/files/1");
    await waitFor(() => expect(state.prFiles[1]?.headContent).toBe("loaded"));
    expect(state.loadingPRFiles).toBe(false);
    expect(state.prComments).toEqual([]);
    expect(api.fetchPRFile).toHaveBeenCalledTimes(1);
    expect(api.fetchPRFile).toHaveBeenCalledWith(files[1],expect.any(AbortSignal));
    await act(async () => state.setSelectedPRFileIdx(0));
    await waitFor(() => expect(state.prFiles[0]?.loadState).toBe("ready"));
    await act(async () => state.setSelectedPRFileIdx(1));
    expect(api.fetchPRFile).toHaveBeenCalledTimes(2);
    await act(async () => comments.resolve([]));
  });

  it("ignores an old selected-file completion and isolates a failed file", async () => {
    const old = deferred<any>();
    const pr = { number: 12, headBranch: "topic", files: [], comments: [] } as any;
    const files = ["one.md", "two.md"].map(path => ({path, baseContent:"", headContent:"", status:"added", loadState:"pending"})) as any;
    vi.mocked(api.fetchPullRequest).mockResolvedValue(pr);
    vi.mocked(api.fetchPRFileManifest).mockResolvedValue(files);
    vi.mocked(api.fetchPRComments).mockResolvedValue([]);
    vi.mocked(api.fetchPRFile).mockImplementation(file => file.path === "one.md" ? old.promise : Promise.reject(new Error("unavailable")));
    await start("#/acme/docs/pull/12");
    await waitFor(() => expect(api.fetchPRFile).toHaveBeenCalled());
    const oldSignal = vi.mocked(api.fetchPRFile).mock.calls.at(-1)![1]!;
    await act(async () => state.setSelectedPRFileIdx(1));
    expect(oldSignal.aborted).toBe(true);
    await waitFor(() => expect(state.prFiles[1]?.loadState).toBe("error"));
    await act(async () => old.resolve({...files[0],headContent:"old",loadState:"ready"}));
    expect(state.prFiles[0].headContent).toBe("");
    expect(state.selectedPRFileIdx).toBe(1);
  });
});


describe("sidebar metadata demand", () => {
  it("makes no list/count requests for a direct document and deduplicates requested lists", async () => {
    const branches = deferred<any[]>();
    const counts = deferred<Map<number, number>>();
    vi.mocked(api.fetchBranches).mockReturnValue(branches.promise);
    vi.mocked(api.fetchPullRequests).mockResolvedValue([{number:12}] as any);
    vi.mocked(api.fetchPRMarkdownCounts).mockReturnValue(counts.promise);
    await start("#/acme/docs/blob/topic/notes.md");
    await waitFor(() => expect(state.fileRevision).toBe(FEATURE));
    expect(api.fetchBranches).not.toHaveBeenCalled();
    expect(api.fetchPullRequests).not.toHaveBeenCalled();
    expect(api.fetchPRMarkdownCounts).not.toHaveBeenCalled();
    await act(async () => { state.loadSidebarMetadata("prs"); state.loadSidebarMetadata("prs"); });
    expect(api.fetchPullRequests).toHaveBeenCalledTimes(1);
    expect(state.pullRequests).toHaveLength(1);
    expect(state.loadingPRs).toBe(false);
    await act(async () => { state.loadSidebarMetadata("branches"); state.loadSidebarMetadata("branches"); });
    expect(api.fetchBranches).toHaveBeenCalledTimes(1);
    expect(state.loadingBranches).toBe(true);
    await act(async () => branches.resolve([{name:"topic",isDefault:true}]));
    await act(async () => counts.resolve(new Map([[12, 3]])));
    expect(state.availableBranches[0].name).toBe("topic");
    expect(state.pullRequests[0].mdFileCount).toBe(3);
    expect(state.loadingBranches).toBe(false);
    await act(async () => { state.loadSidebarMetadata("branches"); state.loadSidebarMetadata("prs"); });
    expect(api.fetchBranches).toHaveBeenCalledTimes(1);
    expect(api.fetchPullRequests).toHaveBeenCalledTimes(1);
  });

  it("drops old metadata on repository switches and retries failed branch loads", async () => {
    const old = deferred<any[]>();
    vi.mocked(api.fetchBranches).mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error("offline")).mockResolvedValue([{name:"new",isDefault:true}]);
    await start("#/acme/docs/blob/topic/notes.md");
    await waitFor(() => expect(state.fileRevision).toBe(FEATURE));
    await act(async () => state.loadSidebarMetadata("branches"));
    await navigate("#/other/docs/blob/new/notes.md");
    await act(async () => old.resolve([{name:"old",isDefault:true}]));
    expect(state.availableBranches).toEqual([]);
    await act(async () => state.loadSidebarMetadata("branches"));
    expect(state.loadingBranches).toBe(false);
    await act(async () => state.loadSidebarMetadata("branches"));
    expect(state.availableBranches[0].name).toBe("new");
    expect(api.fetchBranches).toHaveBeenCalledTimes(3);
  });
});
