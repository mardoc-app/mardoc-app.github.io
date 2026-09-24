import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PRCommentNavigator from "@/components/PRCommentNavigator";
import type { PRComment, PRFile } from "@/types";
afterEach(cleanup);

it("groups renamed targets, retains discussions and replies, and exposes unavailable paths honestly", () => {
  const files = [{path:"new.md",basePath:"old.md"}] as PRFile[];
  const comments = [
    {id:"1",path:"old.md",body:"Rename feedback",resolved:true,replies:[{id:"reply",author:"bob",body:"Reply text"}]},
    {id:"2",body:"General feedback"},
    {id:"3",path:"missing.md",body:"Unavailable feedback"},
  ] as PRComment[];
  const onJump=vi.fn();
  render(<PRCommentNavigator files={files} comments={comments} onJump={onJump}/>);
  fireEvent.click(screen.getByRole("button",{name:"All PR comments (3)"}));
  expect(screen.getByRole("heading",{name:"new.md"})).toBeTruthy();
  expect(screen.getByRole("heading",{name:"General discussion"})).toBeTruthy();
  expect(screen.getByText("Reply text",{exact:false})).toBeTruthy();
  const missing=screen.getByText("Unavailable feedback").closest("article")!;
  expect(within(missing).queryByRole("button")).toBeNull();
  expect(within(missing).getByText(/unavailable in this PR/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Open comment in new.md"}));
  expect(onJump).toHaveBeenCalledWith(comments[0],0);
  expect(screen.queryByRole("heading",{name:"new.md"})).toBeNull();
});
