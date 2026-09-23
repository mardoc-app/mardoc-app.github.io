import { describe, it, expect } from "vitest";
import { parseHash, buildFileHash, buildPRHash, buildRepoHash } from "@/lib/hash-router";

describe("parseHash", () => {
  // ─── Basic routes ───────────────────────────────────────────────────

  it("returns none for empty hash", () => {
    expect(parseHash("")).toEqual({ type: "none" });
    expect(parseHash("#")).toEqual({ type: "none" });
    expect(parseHash("#/")).toEqual({ type: "none" });
  });

  it("returns none for single segment", () => {
    expect(parseHash("#/owner")).toEqual({ type: "none" });
  });

  it("parses repo route", () => {
    expect(parseHash("#/acme/widgets")).toEqual({
      type: "repo",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
    });
  });

  it("parses file route", () => {
    expect(parseHash("#/acme/widgets/blob/main/docs/readme.md")).toEqual({
      type: "file",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
      branch: "main",
      filePath: "docs/readme.md",
    });
  });

  it("parses PR route", () => {
    expect(parseHash("#/acme/widgets/pull/42")).toEqual({
      type: "pr",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
      prNumber: 42,
    });
  });

  it("parses PR file route", () => {
    expect(parseHash("#/acme/widgets/pull/42/files/3")).toEqual({
      type: "pr",
      owner: "acme",
      repo: "widgets",
      repoFullName: "acme/widgets",
      prNumber: 42,
      prFileIdx: 3,
    });
  });

  // ─── URL decoding ──────────────────────────────────────────────────

  it("decodes URL-encoded file paths", () => {
    const route = parseHash("#/acme/widgets/blob/main/docs/my%20file.md");
    expect(route.filePath).toBe("docs/my file.md");
  });

  it("decodes URL-encoded branch names", () => {
    const route = parseHash("#/acme/widgets/blob/feature%2Fnew-thing/readme.md");
    expect(route.branch).toBe("feature/new-thing");
  });

  it("decodes unicode in file paths", () => {
    const route = parseHash("#/acme/widgets/blob/main/docs/%E4%B8%AD%E6%96%87.md");
    expect(route.filePath).toBe("docs/中文.md");
  });

  it("handles already-decoded paths (no double decoding)", () => {
    const route = parseHash("#/acme/widgets/blob/main/docs/normal-file.md");
    expect(route.filePath).toBe("docs/normal-file.md");
  });

  // ─── Malformed routes ──────────────────────────────────────────────

  it("rejects a non-numeric PR number", () => {
    const route = parseHash("#/acme/widgets/pull/abc");
    expect(route.type).toBe("none");
  });

  it("rejects to repo for non-numeric file index", () => {
    const route = parseHash("#/acme/widgets/pull/42/files/abc");
    expect(route.type).toBe("none");
  });
});

describe("buildFileHash", () => {
  it("builds a file hash", () => {
    expect(buildFileHash("acme/widgets", "main", "docs/readme.md"))
      .toBe("#/acme/widgets/blob/main/docs/readme.md");
  });
});

describe("buildPRHash", () => {
  it("builds a PR hash without file index", () => {
    expect(buildPRHash("acme/widgets", 42)).toBe("#/acme/widgets/pull/42");
  });

  it("builds a PR hash with file index", () => {
    expect(buildPRHash("acme/widgets", 42, 3)).toBe("#/acme/widgets/pull/42/files/3");
  });

  it("omits file index when 0", () => {
    expect(buildPRHash("acme/widgets", 42, 0)).toBe("#/acme/widgets/pull/42");
  });
});

describe("buildRepoHash", () => {
  it("builds a repo hash", () => {
    expect(buildRepoHash("acme/widgets")).toBe("#/acme/widgets");
  });
});


describe("shared-link identity", () => {
  it.each(["feature/report", "agent/task/deep", "topic#1", "unicode/中文"])("round-trips branch %s and an encoded path", branch => {
    const path = "docs/a # % 中文.md";
    expect(parseHash(buildFileHash("acme/widgets", branch, path))).toMatchObject({ branch, filePath: path });
  });
  it.each(["#/acme/widgets/blob/%ZZ/a.md", "#/acme/widgets/pull/12junk", "#/acme/widgets/pull/-1", "#/acme/widgets/pull/1/files/2junk", "#/acme/widgets/pull/1/extra"])("rejects malformed %s", hash => {
    expect(parseHash(hash).type).toBe("none");
  });
});
