import { afterEach, expect, it, vi } from "vitest";
import { fetchBranches, fetchPRMarkdownCounts, fetchPullRequests, initOctokit, resetGitHubSession } from "@/lib/github-api";

afterEach(() => { resetGitHubSession(); vi.unstubAllGlobals(); });

it("passes the caller signal to branch metadata, pagination, and PR enumeration", async () => {
  const client = initOctokit("fake");
  const get = vi.fn().mockResolvedValue({data:{default_branch:"main"}});
  const paginate = vi.fn().mockResolvedValue([{name:"main"}]);
  const list = vi.fn().mockResolvedValue({data:[]});
  client.repos.get = get as any;
  client.paginate = paginate as any;
  client.pulls.list = list as any;
  const {signal} = new AbortController();
  await fetchBranches("acme/docs", signal);
  await fetchPullRequests("acme/docs", "closed", signal);
  expect(get).toHaveBeenCalledWith(expect.objectContaining({request:{signal}}));
  expect(paginate).toHaveBeenCalledWith(client.repos.listBranches, expect.objectContaining({request:{signal}}));
  expect(list).toHaveBeenCalledWith(expect.objectContaining({state:"closed",request:{signal}}));
});

it("aborts the GraphQL count transport instead of returning an empty success", async () => {
  let transportSignal!: AbortSignal;
  const fetcher = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    transportSignal = options.signal!;
    transportSignal.addEventListener("abort", () => reject(transportSignal.reason), {once:true});
  }));
  vi.stubGlobal("fetch", fetcher);
  initOctokit("fake");
  const controller = new AbortController();
  const counts = fetchPRMarkdownCounts("acme/docs", [12], controller.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(counts).rejects.toMatchObject({name:"AbortError"});
  expect(transportSignal.aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("preserves the count fallback for ordinary GraphQL failures", async () => {
  const client = initOctokit("fake");
  client.graphql = vi.fn().mockRejectedValue(new Error("Forbidden")) as any;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(fetchPRMarkdownCounts("acme/docs", [12])).resolves.toEqual(new Map());
  } finally { log.mockRestore(); }
});
