import { afterEach, expect, it, vi } from "vitest";
import { formatReviewFallback, parseReviewFallback } from "@/lib/review-comment-context";
import { commentTargetForFile } from "@/lib/comment-target";
import { fetchPRComments, initOctokit, resetGitHubSession, submitReviewBatched } from "@/lib/github-api";
import type { PRFile } from "@/types";
afterEach(resetGitHubSession);
const commitId="b".repeat(40);
const comment={localId:"draft-1",commitId,path:"docs/support/architecture.html",startLine:5,line:7,side:"RIGHT" as const,
  body:'> _"Dashboard 日本語"_\n\nPlease explain.'};
const oversized={status:422,message:'Unprocessable Entity: "Diff entry docs/support/architecture.html diff is too large"'};

it("round-trips a readable fallback comment, quote and pinned location",()=>{
  const body=formatReviewFallback(comment);
  expect(body).toContain("**docs/support/architecture.html** (L5-L7)");
  expect(body).toContain(comment.body);
  expect(body).not.toContain("draft-1");
  expect(parseReviewFallback(body)).toEqual({body:comment.body,target:{path:comment.path,side:"RIGHT",startLine:5,endLine:7,commitId,revisionPinned:true,status:"current"}});
  expect(parseReviewFallback("A regular discussion")).toBeUndefined();
  expect(parseReviewFallback(body.replace("v1 ","v2 "))).toBeUndefined();
  expect(parseReviewFallback(body.replace("%7B","%ZZ"))).toBeUndefined();
  expect(parseReviewFallback(formatReviewFallback({...comment,line:-1}))).toBeUndefined();
  expect(parseReviewFallback(formatReviewFallback({...comment,commitId:"not-a-revision"}))).toBeUndefined();
});

it("refuses to reuse fallback coordinates on a different or unknown revision",()=>{
  const target=parseReviewFallback(formatReviewFallback(comment))!.target;
  expect(commentTargetForFile(target,{headRef:commitId} as PRFile)?.status).toBe("current");
  expect(commentTargetForFile(target,{headRef:"c".repeat(40)} as PRFile)?.status).toBe("outdated");
  expect(commentTargetForFile(target,{} as PRFile)?.status).toBe("unknown");
});

it("posts an oversized-diff fallback and restores its location on an API reload",async()=>{
  const client=initOctokit("fake");
  client.pulls.get=vi.fn().mockResolvedValue({data:{head:{sha:commitId}}}) as any;
  client.pulls.createReview=vi.fn().mockRejectedValueOnce(oversized).mockResolvedValue({data:{}}) as any;
  client.pulls.createReviewComment=vi.fn().mockRejectedValue(oversized) as any;
  client.issues.createComment=vi.fn().mockResolvedValue({data:{}}) as any;
  await expect(submitReviewBatched("acme/docs",12,"COMMENT","Review summary",[comment])).resolves.toEqual({unresolvedCount:1});
  expect(client.pulls.createReview).toHaveBeenLastCalledWith(expect.objectContaining({event:"COMMENT",body:"Review summary",comments:undefined}));
  const body=(client.issues.createComment as any).mock.calls[0][0].body;
  client.pulls.listReviewComments=vi.fn().mockResolvedValue({data:[]}) as any;
  client.issues.listComments=vi.fn().mockResolvedValue({data:[{id:9,body,user:{login:"reviewer"}}]}) as any;
  client.graphql=vi.fn().mockResolvedValue({repository:{pullRequest:{reviewThreads:{nodes:[]}}}}) as any;
  const loaded=await fetchPRComments("acme/docs",12);
  expect(loaded[0]).toMatchObject({id:"ic-9",path:comment.path,body:comment.body,selectedText:"Dashboard 日本語",target:{commitId,revisionPinned:true,startLine:5,endLine:7}});
});

it("reports confirmed comments when the final review event fails",async()=>{
  const client=initOctokit("fake");
  client.pulls.get=vi.fn().mockResolvedValue({data:{head:{sha:commitId}}}) as any;
  client.pulls.createReview=vi.fn().mockRejectedValueOnce(oversized).mockRejectedValueOnce(new Error("Review denied")) as any;
  client.pulls.createReviewComment=vi.fn().mockRejectedValue(oversized) as any;
  client.issues.createComment=vi.fn().mockResolvedValue({data:{}}) as any;
  await expect(submitReviewBatched("acme/docs",12,"APPROVE",undefined,[comment])).rejects.toMatchObject({name:"ReviewFallbackError",postedComments:[comment],unresolvedCount:1});
  expect(client.issues.createComment).toHaveBeenCalledTimes(1);
});

it("does not fall back or post comments for an unrelated batch rejection",async()=>{
  const client=initOctokit("fake");
  client.pulls.get=vi.fn().mockResolvedValue({data:{head:{sha:commitId}}}) as any;
  client.pulls.createReview=vi.fn().mockRejectedValue({status:422,message:"Cannot approve your own pull request"}) as any;
  client.pulls.createReviewComment=vi.fn() as any;
  client.issues.createComment=vi.fn() as any;
  await expect(submitReviewBatched("acme/docs",12,"APPROVE",undefined,[comment])).rejects.toMatchObject({status:422});
  expect(client.pulls.createReviewComment).not.toHaveBeenCalled();
  expect(client.issues.createComment).not.toHaveBeenCalled();
});
