import { afterEach, expect, it, vi } from "vitest";
import { reviewCommentTarget, selectionQuote, commentFileIndex } from "@/lib/comment-target";
import { fetchPRComments, initOctokit, resetGitHubSession } from "@/lib/github-api";
import { mergeFreshComments } from "@/lib/comment-merge";
import type { PRComment, PRFile } from "@/types";

afterEach(resetGitHubSession);

it("keeps historical ranges separate from current base-side coordinates", () => {
  expect(reviewCommentTarget({path:"old.html", side:"LEFT", start_side:"LEFT",
    commit_id:"new", original_commit_id:"old", start_line:10, line:12,
    original_start_line:3, original_line:5})).toEqual({
    path:"old.html",side:"LEFT",startSide:"LEFT",commitId:"new",originalCommitId:"old",
    startLine:10,endLine:12,originalStartLine:3,originalEndLine:5,status:"current",
  });
});
it("does not pretend an outdated comment points to current lines", () => {
  expect(reviewCommentTarget({path:"deck.html",line:null,original_line:40}))
    .toMatchObject({status:"outdated",startLine:undefined,endLine:undefined,originalEndLine:40});
  expect(reviewCommentTarget({path:"deck.html",subject_type:"file",line:null}))
    .toMatchObject({status:"file",endLine:undefined});
  expect(reviewCommentTarget({path:"deck.html"})).toMatchObject({status:"unknown",side:undefined});
});
it("recovers multiline Unicode selection quotes without guessing ordinary quotations", () => {
  expect(selectionQuote('> _"First\n日本語 \"quoted\" text"_\n\nPlease revise.')).toBe('First\n日本語 "quoted" text');
  expect(selectionQuote('> _"Selection"_\r\n\r\nBody')).toBe("Selection");
  expect(selectionQuote("> ordinary quote\n\nBody")).toBeUndefined();
  expect(selectionQuote('Body\n\n> _"not a leading selection"_\n\nMore')).toBeUndefined();
});
it("matches current filenames first and accepts only unique old-path aliases", () => {
  const files = [{path:"new.md",basePath:"old.md"},{path:"other.md"}] as PRFile[];
  const comment = {target:reviewCommentTarget({path:"old.md",side:"LEFT",line:1})} as PRComment;
  expect(commentFileIndex(comment,files)).toBe(0);
  expect(commentFileIndex(comment,[...files,{path:"old.md"} as PRFile])).toBe(2);
  expect(commentFileIndex(comment,[...files,{path:"second.md",basePath:"old.md"} as PRFile])).toBe(-1);
  expect(commentFileIndex({} as PRComment,files)).toBe(-1);
});
it("preserves location and quote through an actual API reload and state merge", async () => {
  const client = initOctokit("fake");
  const body = '> _"Dashboard 日本語"_\n\nExplain this.';
  client.pulls.listReviewComments = vi.fn().mockResolvedValue({data:[
    {id:1,path:"old.html",body,user:{login:"reviewer"},created_at:"2026-09-24",
      side:"LEFT",start_side:"LEFT",line:12,start_line:10,original_line:8,
      original_start_line:6,commit_id:"current",original_commit_id:"original"},
    {id:2,path:"old.html",body:"Outdated",user:{login:"reviewer"},line:null,original_line:3},
    {id:3,path:"new.html",body:"File discussion",user:{login:"reviewer"},line:null,subject_type:"file"},
  ]}) as any;
  client.issues.listComments = vi.fn().mockResolvedValue({data:[]}) as any;
  client.graphql = vi.fn().mockResolvedValue({repository:{pullRequest:{reviewThreads:{nodes:[]}}}}) as any;
  const first = await fetchPRComments("acme/docs",12);
  const reloaded = mergeFreshComments(first,await fetchPRComments("acme/docs",12));
  expect(reloaded[0]).toMatchObject({body,selectedText:"Dashboard 日本語",
    target:{path:"old.html",side:"LEFT",commitId:"current",originalCommitId:"original",
      startLine:10,endLine:12,originalStartLine:6,originalEndLine:8}});
  expect(reloaded[1]).toMatchObject({startLine:undefined,endLine:undefined,target:{status:"outdated"}});
  expect(reloaded[2].target?.status).toBe("file");
});
