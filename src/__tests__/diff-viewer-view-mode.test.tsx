/**
 * F-86, F-88, F-89: how DiffViewer picks, keeps and reports its view mode.
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import DiffViewer from "@/components/DiffViewer";
import type { PRFile, PRComment } from "@/types";

vi.mock("@/lib/app-context", () => ({ useApp: () => ({ isEmbedded: false }) }));
vi.mock("@/lib/github-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/github-api")>("@/lib/github-api");
  return { ...actual, loadAuthenticatedImages: vi.fn(), loadEmbedLocalImages: vi.fn(),
    rewriteImageUrls: (html: string) => html, mapSelectionToLines: () => ({ startLine: 1, endLine: 1 }) };
});
vi.mock("@/lib/mermaid", () => ({ renderMermaidBlocks: vi.fn() }));
vi.mock("@/lib/highlight", () => ({ highlightCodeBlocks: (html: string) => html }));

// The right-click menu is replaced by one button that asks for a suggestion, the call the menu makes.
vi.mock("@/components/ContextMenu", () => ({
  default: ({ onSuggestChange }: { onSuggestChange?: (text: string) => void }) =>
    <button type="button" onClick={() => onSuggestChange?.("New line.")}>suggest-from-menu</button>,
}));

const KEY = "mardoc_view_mode";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }) });
});
afterEach(() => cleanup());

const md: PRFile = { path: "docs/notes.md", status: "modified", baseContent: "# Notes\n\nOld line.\n", headContent: "# Notes\n\nNew line.\n" };
const html = (over: Partial<PRFile> = {}): PRFile => ({ path: "docs/page.html", status: "modified",
  baseContent: "<html><body><p>Old page.</p></body></html>", headContent: "<html><body><p>New page.</p></body></html>", ...over });
const comment: PRComment = { id: "rc-1", path: "docs/notes.md", author: "alice", avatarColor: "#264653", body: "Clarify?",
  createdAt: "2026-04-16T00:00:00Z", blockIndex: 0, selectedText: "New line.", resolved: false, replies: [] };

function viewer(file: PRFile, extra: Partial<React.ComponentProps<typeof DiffViewer>> = {}) {
  return <DiffViewer file={file} repoFullName="o/r" baseBranch="main" headBranch="topic" comments={[]}
    onAddComment={vi.fn()} onResolveComment={vi.fn()} {...extra} />;
}
const pressed = (name: string) => screen.queryAllByRole("button", { name }).some(b => b.getAttribute("aria-pressed") === "true");
const srcdoc = () => document.querySelector("iframe")?.getAttribute("srcdoc") ?? "";

describe("view mode in DiffViewer", () => {
  it("f86_preview_link_on_an_html_file_presses_head", () => {
    render(viewer(html(), { linkMode: "preview" }));
    expect(pressed("Head (new)")).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("f89_remembered_base_on_an_added_html_file_opens_diff", () => {
    localStorage.setItem(KEY, JSON.stringify({ html: "base" }));
    render(viewer(html({ status: "added", baseContent: "" })));
    expect(pressed("Base (old)")).toBe(false);
    expect(pressed("Inline Diff")).toBe(true);
    expect(srcdoc()).toContain("New page.");
  });

  it("f89_linked_base_on_an_added_html_file_opens_diff", () => {
    render(viewer(html({ status: "added", baseContent: "" }), { linkMode: "base" }));
    expect(pressed("Inline Diff")).toBe(true);
  });

  it("f89_remembered_head_on_a_deleted_html_file_opens_diff", () => {
    localStorage.setItem(KEY, JSON.stringify({ html: "head" }));
    render(viewer(html({ status: "deleted", headContent: "" })));
    expect(pressed("Head (new)")).toBe(false);
    expect(pressed("Inline Diff")).toBe(true);
    expect(srcdoc()).toContain("Old page.");
  });

  it("f88_a_file_shown_again_keeps_its_clicked_view", () => {
    const { rerender } = render(viewer(md, { active: true }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    rerender(viewer(md, { active: false }));
    localStorage.setItem(KEY, JSON.stringify({ md: "suggest" }));
    rerender(viewer(md, { active: true }));
    expect(pressed("Preview")).toBe(true);
  });

  it("f88_a_comment_jump_does_not_save_a_mode", async () => {
    render(viewer(md, { comments: [comment], externalJump: { id: "rc-1", sequence: 1 } }));
    await waitFor(() => expect(pressed("Side by Side")).toBe(true));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("f88_suggest_from_the_context_menu_does_not_save_a_mode", () => {
    render(viewer(md));
    fireEvent.click(screen.getByRole("button", { name: "suggest-from-menu" }));
    expect(pressed("Suggest")).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("f88_an_html_comment_jump_does_not_save_a_mode", async () => {
    const file = html({ path: "docs/notes.html" });
    const htmlComment = { ...comment, path: "docs/notes.html", target: { side: "LEFT" } } as PRComment;
    render(viewer(file, { comments: [htmlComment], externalJump: { id: "rc-1", sequence: 1 } }));
    await waitFor(() => expect(pressed("Base (old)")).toBe(true));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("f86_following_the_same_link_again_applies_its_mode_again", () => {
    const { rerender } = render(viewer(md, { linkMode: "preview", linkSeq: 1 }));
    expect(pressed("Preview")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Inline Diff" }));
    expect(pressed("Inline Diff")).toBe(true);
    rerender(viewer(md, { linkMode: "preview", linkSeq: 2 }));
    expect(pressed("Preview")).toBe(true);
  });

  it("f87_the_shown_mode_is_reported_and_cleared_when_the_file_is_no_longer_shown", () => {
    const seen: Array<string | undefined> = [];
    const onModeChange = (token: string | undefined) => { seen.push(token); };
    const { rerender } = render(viewer(md, { onModeChange }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    rerender(viewer(md, { onModeChange, active: false }));
    expect(seen).toEqual(["inline", "preview", undefined]);
  });
});
