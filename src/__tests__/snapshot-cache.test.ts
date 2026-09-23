import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequestCache } from "@/lib/request-cache";
import { initOctokit, resetGitHubSession, fetchRevision, fetchFileContent, fetchPRFiles,
  loadAuthenticatedImages, rewriteImageUrls, __resetImageCachesForTests } from "@/lib/github-api";
import { createTurndownService } from "@/lib/turndown";
const A="a".repeat(40), B="b".repeat(40);
const data = (content:string) => ({data:{encoding:"base64",content:btoa(content)}});
function deferred<T>() { let resolve!: (v:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; }
beforeEach(()=>{ resetGitHubSession(); });

describe("bounded session caches",()=>{
  it("deduplicates in-flight reads and evicts least recently used values",async()=>{
    const cache=new RequestCache<string>(2); const pending=deferred<string>();
    const loader=vi.fn(()=>pending.promise);
    const first=cache.load("a",loader), second=cache.load("a",loader);
    pending.resolve("A"); expect(await first).toBe("A"); expect(await second).toBe("A");
    expect(loader).toHaveBeenCalledTimes(1);
    cache.set("b","B"); cache.get("a"); cache.set("c","C");
    expect(cache.get("b")).toBeUndefined(); expect(cache.get("a")).toBe("A");
  });
  it("does not retain oversized entries or old-session completions",async()=>{
    const cache=new RequestCache<string>(2,20); cache.set("huge","x".repeat(20));
    expect(cache.get("huge")).toBeUndefined();
    const pending=deferred<string>(); const old=cache.load("a",()=>pending.promise);
    cache.clear(); cache.set("a","NEW"); pending.resolve("OLD"); await old;
    expect(cache.get("a")).toBe("NEW");
  });
  it("retries rejected requests instead of caching the rejection",async()=>{
    const cache=new RequestCache<string>(); const loader=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("ok");
    await expect(cache.load("a",loader)).rejects.toThrow("offline");
    expect(await cache.load("a",loader)).toBe("ok");
  });
});

describe("GitHub snapshots",()=>{
  it("loads large documents by immutable blob SHA and retries failed blob reads",async()=>{
    const client=initOctokit("fake");
    client.repos.getContent=vi.fn().mockResolvedValue({data:{type:"file",encoding:"none",content:"",sha:B}}) as any;
    const blob=vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(data("<h1>Training</h1>"));
    client.git.getBlob=blob as any;
    await expect(fetchFileContent("acme/docs","deck.html",A)).rejects.toThrow("offline");
    expect(await fetchFileContent("acme/docs","deck.html",A)).toBe("<h1>Training</h1>");
    await fetchFileContent("acme/docs","deck.html",A);
    expect(blob).toHaveBeenCalledTimes(2);
    expect(blob).toHaveBeenLastCalledWith({owner:"acme",repo:"docs",file_sha:B});
  });

  it("revalidates moving branches and deduplicates only concurrent resolution",async()=>{
    const client=initOctokit("fake");
    const getCommit=vi.fn().mockResolvedValueOnce({data:{sha:A}}).mockResolvedValueOnce({data:{sha:B}});
    client.repos.getCommit=getCommit as any;
    expect(await Promise.all([fetchRevision("acme/docs","topic"),fetchRevision("acme/docs","topic")])).toEqual([A,A]);
    expect(await fetchRevision("acme/docs","topic")).toBe(B);
    expect(await fetchRevision("acme/docs",A)).toBe(A);
    expect(getCommit).toHaveBeenCalledTimes(2);
    const fetcher=vi.fn().mockResolvedValue({}); vi.stubGlobal("fetch",fetcher);
    await getCommit.mock.calls[0][0].request.fetch("https://example.test",{});
    expect(fetcher).toHaveBeenCalledWith("https://example.test",expect.objectContaining({cache:"no-store"}));
    vi.unstubAllGlobals();
  });
  it("caches per repository/path/commit and clears on auth change",async()=>{
    const client=initOctokit("first"); const getContent=vi.fn().mockResolvedValue(data("old"));
    client.repos.getContent=getContent as any;
    await Promise.all([fetchFileContent("acme/docs","a.md",A),fetchFileContent("acme/docs","a.md",A)]);
    await fetchFileContent("acme/docs","a.md",A); expect(getContent).toHaveBeenCalledTimes(1);
    await fetchFileContent("acme/docs","a.md",B); expect(getContent).toHaveBeenCalledTimes(2);
    const next=initOctokit("second"); const fresh=vi.fn().mockResolvedValue(data("new")); next.repos.getContent=fresh as any;
    expect(await fetchFileContent("acme/docs","a.md",A)).toBe("new");
    resetGitHubSession(); await expect(fetchFileContent("acme/docs","a.md",A)).rejects.toThrow("Not authenticated");
  });
  it("shares duplicate image reads and refreshes when the revision advances",async()=>{
    const client=initOctokit("fake"); const getContent=vi.fn().mockResolvedValue(data("old")); client.repos.getContent=getContent as any;
    const container=document.createElement("div"); const source='<img src="./a.png"><img src="./a.png">';
    container.innerHTML=rewriteImageUrls(source,"acme/docs",A,"docs/spec.md");
    await loadAuthenticatedImages(container); expect(getContent).toHaveBeenCalledTimes(1);
    getContent.mockResolvedValue(data("new"));
    container.innerHTML=rewriteImageUrls(source,"acme/docs",B,"docs/spec.md");
    await loadAuthenticatedImages(container); expect(getContent).toHaveBeenCalledTimes(2);
    expect(container.querySelector("img")!.src).toContain(btoa("new"));
    const warmed=rewriteImageUrls(source,"acme/docs",B,"docs/spec.md");
    expect(createTurndownService().turndown(warmed)).toContain("./a.png");
    expect(createTurndownService().turndown(warmed)).not.toContain("base64");
  });
  it("does not retain images under a mutable branch name",async()=>{
    const client=initOctokit("fake");const getContent=vi.fn().mockResolvedValue(data("old"));client.repos.getContent=getContent as any;
    const container=document.createElement("div"); const source='<img src="./a.png">';
    container.innerHTML=rewriteImageUrls(source,"acme/docs","topic","spec.md"); await loadAuthenticatedImages(container);
    getContent.mockResolvedValue(data("new"));
    container.innerHTML=rewriteImageUrls(source,"acme/docs","topic","spec.md"); await loadAuthenticatedImages(container);
    expect(getContent).toHaveBeenCalledTimes(2); expect(container.querySelector("img")!.src).toContain(btoa("new"));
  });
  it("keeps PR text and asset identities pinned, including renamed files and forks",async()=>{
    const client=initOctokit("fake");
    client.paginate=vi.fn().mockResolvedValue([{filename:"new.md",previous_filename:"old.md",status:"renamed"}]) as any;
    client.pulls.get=vi.fn().mockResolvedValue({data:{base:{sha:A,repo:{full_name:"acme/docs"}},head:{sha:B,repo:{full_name:"contributor/docs"}}}}) as any;
    const getContent=vi.fn().mockResolvedValue(data("content"));client.repos.getContent=getContent as any;
    const [file]=await fetchPRFiles("acme/docs",12);
    expect(file).toMatchObject({baseRef:A,headRef:B,basePath:"old.md",headRepo:"contributor/docs"});
    expect(getContent).toHaveBeenCalledWith(expect.objectContaining({owner:"acme",path:"old.md",ref:A}));
    expect(getContent).toHaveBeenCalledWith(expect.objectContaining({owner:"contributor",path:"new.md",ref:B}));
  });
});
