import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { initOctokit, resetGitHubSession, fetchPRFileManifest, fetchPRFile } from "@/lib/github-api";
import { githubReviewFileUrl } from "@/lib/github-review-url";
import SourceDiffViewer from "@/components/SourceDiffViewer";
vi.mock("@/lib/app-context", () => ({ useApp: () => ({ isEmbedded: false }) }));
afterEach(() => { cleanup(); resetGitHubSession(); vi.unstubAllGlobals(); });

it("keeps legacy document indices while listing code, binary, renamed and deleted files", async () => {
  const client = initOctokit("fake");
  client.paginate = vi.fn().mockResolvedValue([
    { filename: "main.go", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1 },
    { filename: "guide.md", status: "modified" },
    { filename: "diagram.png", status: "removed" },
    { filename: "deck.html", status: "added" },
    { filename: "new.rs", previous_filename: "old.rs", status: "renamed" },
  ]) as any;
  client.pulls.get = vi.fn().mockResolvedValue({ data: {
    base: { sha: "a", repo: { full_name: "acme/repo" } },
    head: { sha: "b", repo: { full_name: "fork/repo" } },
  } }) as any;
  const files = await fetchPRFileManifest("acme/repo", 12);
  expect(files.map(file => file.path)).toEqual(["guide.md", "deck.html", "main.go", "diagram.png", "new.rs"]);
  expect(files[2]).toMatchObject({ loadState: "ready", additions: 1, deletions: 1 });
  expect(files[3]).toMatchObject({ status: "deleted", changeType: "removed" });
  expect(files[4]).toMatchObject({ basePath: "old.rs", changeType: "renamed", headRepo: "fork/repo" });
  const read = vi.fn(); client.repos.getContent = read as any;
  await fetchPRFile(files[2]);
  expect(read).not.toHaveBeenCalled();
});

it("builds a file-specific GitHub anchor without exposing source content", async () => {
  const digest = vi.fn().mockResolvedValue(new Uint8Array([1, 254]).buffer);
  vi.stubGlobal("crypto", { subtle: { digest } });
  expect(await githubReviewFileUrl("acme/repo", 12, "src/main.go")).toBe("https://github.com/acme/repo/pull/12/files#diff-01fe");
  expect(digest.mock.calls[0][0]).toBe("SHA-256");
  expect(new TextDecoder().decode(digest.mock.calls[0][1])).toBe("src/main.go");
});

it("offers a GitHub handoff instead of interpreting arbitrary source as Markdown", () => {
  render(<SourceDiffViewer file={{ path: "main.py", status: "modified", baseContent: "", headContent: "# not Markdown" }}
    repoFullName="acme/repo" prNumber={12} />);
  expect(screen.getByRole("link", { name: "Review on GitHub" }).getAttribute("href")).toContain("/pull/12/files");
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.queryByText("# not Markdown")).toBeNull();
});
