import { afterEach, expect, it, vi } from "vitest";
import { fetchPRComments, initOctokit, resetGitHubSession } from "@/lib/github-api";

afterEach(resetGitHubSession);
const review = (id: number) => ({id, path:"guide.md", body:`Comment ${id}`, line:3, side:"RIGHT", user:{login:"reviewer"}});
const threadPage = (id: number, next: boolean) => ({repository:{pullRequest:{reviewThreads:{
  nodes:[{id:`thread-${id}`,isResolved:true,comments:{nodes:[{databaseId:id}]}}],
  pageInfo:{hasNextPage:next,endCursor:next ? "page-two" : null},
}}}});

it("loads every REST page, late replies, and resolution cursors", async () => {
  const client = initOctokit("fake");
  client.pulls.listReviewComments = vi.fn().mockResolvedValueOnce({data:Array.from({length:100},(_,i)=>review(i+1))})
    .mockResolvedValueOnce({data:[review(101),{...review(102),in_reply_to_id:1}]}) as any;
  client.issues.listComments = vi.fn().mockResolvedValueOnce({data:Array.from({length:100},(_,i)=>({id:i+1,body:"General"}))})
    .mockResolvedValueOnce({data:[{id:101,body:"Last general"}]}) as any;
  client.graphql = vi.fn().mockResolvedValueOnce(threadPage(1,true)).mockResolvedValueOnce(threadPage(101,false)) as any;
  const comments = await fetchPRComments("acme/docs",12);
  expect(comments).toHaveLength(202);
  expect(comments[0]).toMatchObject({resolved:true,replies:[{id:"rc-102"}]});
  expect(comments.find(c=>c.id==="rc-101")).toMatchObject({resolved:true,threadId:"thread-101"});
  expect(comments.at(-1)?.body).toBe("Last general");
  expect(client.pulls.listReviewComments).toHaveBeenLastCalledWith(expect.objectContaining({page:2}));
  expect(client.issues.listComments).toHaveBeenLastCalledWith(expect.objectContaining({page:2}));
  expect(client.graphql).toHaveBeenLastCalledWith(expect.stringContaining("pageInfo"),expect.objectContaining({cursor:"page-two"}));
});

it("does not publish incomplete REST results when a later page fails", async () => {
  const client = initOctokit("fake");
  client.pulls.listReviewComments = vi.fn().mockResolvedValueOnce({data:Array.from({length:100},(_,i)=>review(i+1))})
    .mockRejectedValueOnce(new Error("offline")) as any;
  client.issues.listComments = vi.fn().mockResolvedValue({data:[]}) as any;
  await expect(fetchPRComments("acme/docs",12)).rejects.toThrow("offline");
});

it("stops before requesting another REST page after cancellation", async () => {
  const client = initOctokit("fake"), controller = new AbortController();
  client.pulls.listReviewComments = vi.fn().mockImplementation(async () => {
    controller.abort();
    return {data:Array.from({length:100},(_,i)=>review(i+1))};
  }) as any;
  client.issues.listComments = vi.fn().mockResolvedValue({data:[]}) as any;
  await expect(fetchPRComments("acme/docs",12,controller.signal)).rejects.toThrow();
  expect(client.pulls.listReviewComments).toHaveBeenCalledTimes(1);
});

it("propagates cancellation between GraphQL pages instead of falling back", async () => {
  const client = initOctokit("fake"), controller = new AbortController();
  client.pulls.listReviewComments = vi.fn().mockResolvedValue({data:[review(1)]}) as any;
  client.issues.listComments = vi.fn().mockResolvedValue({data:[]}) as any;
  client.graphql = vi.fn().mockImplementation(async () => {controller.abort(); return threadPage(1,true);}) as any;
  await expect(fetchPRComments("acme/docs",12,controller.signal)).rejects.toThrow();
  expect(client.graphql).toHaveBeenCalledTimes(1);
});

it("does not turn a later thread-page failure into unresolved comments", async () => {
  const client = initOctokit("fake");
  client.pulls.listReviewComments = vi.fn().mockResolvedValue({data:[review(1)]}) as any;
  client.issues.listComments = vi.fn().mockResolvedValue({data:[]}) as any;
  client.graphql = vi.fn().mockResolvedValueOnce(threadPage(1,true)).mockRejectedValueOnce(new Error("offline")) as any;
  await expect(fetchPRComments("acme/docs",12)).rejects.toThrow("offline");
});
