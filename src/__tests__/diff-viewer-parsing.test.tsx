import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import * as blocks from "@/lib/diff-blocks";
import DiffViewer from "@/components/DiffViewer";
import type { PRFile, PRComment } from "@/types";

vi.mock("@/lib/app-context", () => ({
  useApp: () => ({ isEmbedded: false }),
}));

vi.mock("@/lib/github-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-api")>(
    "@/lib/github-api"
  );
  return {
    ...actual,
    loadAuthenticatedImages: vi.fn(),
    loadEmbedLocalImages: vi.fn(),
    rewriteImageUrls: (html: string) => html,
    mapSelectionToLines: () => ({ startLine: 1, endLine: 1 }),
  };
});

vi.mock("@/lib/mermaid", () => ({
  renderMermaidBlocks: vi.fn(),
}));
vi.mock("@/lib/highlight", () => ({
  highlightCodeBlocks: (html: string) => html,
}));

beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }),
    });
  }
});

afterEach(() => {
  cleanup();
});

it("reuses parsed blocks across diff rendering and comment updates, invalidating only changed content", () => {
  const parse = vi.spyOn(blocks, "parseBlocks");
  const ranges = vi.spyOn(blocks, "computeBlockLineRanges");
  const file: PRFile = {path:"notes.md", status:"modified",baseContent:"# Notes\n\nOld text.",headContent:"# Notes\n\nNew text."};
  const props = {file,repoFullName:"acme/docs",baseBranch:"main",headBranch:"topic",comments:[],onAddComment:vi.fn(),onResolveComment:vi.fn()};
  const {rerender} = render(<DiffViewer {...props}/>);
  expect(parse).toHaveBeenCalledTimes(2);
  expect(ranges).toHaveBeenCalledTimes(2);
  rerender(<DiffViewer {...props} file={{...file}} comments={[]}/>);
  expect(parse).toHaveBeenCalledTimes(2);
  expect(ranges).toHaveBeenCalledTimes(2);
  rerender(<DiffViewer {...props} file={{...file,headContent:"# Notes\n\nRevised text."}}/>);
  expect(parse).toHaveBeenCalledTimes(3);
  expect(ranges).toHaveBeenCalledTimes(3);
  expect(screen.getAllByText(/Revised/).length).toBeGreaterThan(0);
  vi.restoreAllMocks();
});

it("keeps Markdown diff, preview, line numbers and suggestions reachable from the dock", async () => {
  const file: PRFile = {
    path: "docs/guide.md", status: "modified",
    baseContent: "# Guide\n\nOld paragraph.\n\n- Stable list item",
    headContent: "# Guide\n\nNew paragraph.\n\n- Stable list item",
  };
  render(<DiffViewer file={file} repoFullName="acme/docs" baseBranch="main" headBranch="topic"
    comments={[]} onAddComment={vi.fn()} onResolveComment={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Inline Diff" }).getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelectorAll(".line-gutter")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Review tools" }));
  fireEvent.click(screen.getByTitle("Show line numbers"));
  expect(document.querySelectorAll(".line-gutter").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Close review tools" }));
  fireEvent.click(screen.getByRole("button", { name: "Side by Side" }));
  expect(screen.getByRole("button", { name: "Side by Side" }).getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector('[data-review-side="LEFT"][data-review-start="3"]')?.textContent).toBe("Old paragraph.");
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(document.querySelector('[data-review-side="LEFT"]')).toBeNull();
  expect(screen.getByText("New paragraph.")).toBeTruthy();
  expect(document.querySelectorAll(".line-gutter").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
  await waitFor(() => expect(screen.getByText(/Click any block to edit/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Inline Diff" }));
  expect(screen.getAllByText(/New/).length).toBeGreaterThan(0);
});
