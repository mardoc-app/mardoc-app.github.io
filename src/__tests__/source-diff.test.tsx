import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseSourceDiff, MAX_SOURCE_DIFF_LINES, MAX_SOURCE_PATCH_CHARS } from "@/lib/source-diff";
import SourceDiffViewer from "@/components/SourceDiffViewer";
vi.mock("@/lib/app-context", () => ({ useApp: () => ({ isEmbedded: false }) }));
afterEach(cleanup);

it("tracks old and new line numbers across multiple hunks and newline notes", () => {
  const result = parseSourceDiff("@@ -2,2 +2,2 @@\n same\n-old\n+new\n@@ -9,0 +10,1 @@\n+added\n\\ No newline at end of file", 2, 1);
  expect(result.partial).toBe(false);
  expect(result.lines).toEqual([
    { kind: "hunk", text: "@@ -2,2 +2,2 @@" },
    { kind: "context", text: "same", oldLine: 2, newLine: 2 },
    { kind: "deletion", text: "old", oldLine: 3 },
    { kind: "addition", text: "new", newLine: 3 },
    { kind: "hunk", text: "@@ -9,0 +10,1 @@" },
    { kind: "addition", text: "added", newLine: 10 },
    { kind: "note", text: "\\ No newline at end of file" },
  ]);
});
it("bounds parsing and identifies missing changed lines", () => {
  expect(parseSourceDiff("@@ -1 +1 @@\n-old\n+new", 2, 1).partial).toBe(true);
  const large = parseSourceDiff("@@ -1 +1 @@\n" + "+new\n".repeat(5_000));
  expect(large.lines).toHaveLength(MAX_SOURCE_DIFF_LINES);
  expect(large.truncated).toBe(true);
  expect(parseSourceDiff("+" + "x".repeat(MAX_SOURCE_PATCH_CHARS)).lines).toEqual([]);
});
it("escapes source markup, reveals more rows, and labels partial previews", () => {
  const patch = "@@ -1 +1,600 @@\n-old\n+<script>window.ran=true</script>\n" + "+line\n".repeat(599);
  render(<SourceDiffViewer file={{ path: "main.rs", status: "modified", baseContent: "", headContent: "", patch, additions: 700, deletions: 1 }}
    repoFullName="acme/repo" prNumber={12} />);
  expect(screen.getByText("<script>window.ran=true</script>")).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Partial preview");
  expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(500);
  fireEvent.click(screen.getByRole("button", { name: "Show next 500 lines" }));
  expect(screen.getByRole("table").querySelectorAll("tbody tr")).toHaveLength(602);
});
