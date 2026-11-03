import { describe, it, expect } from "vitest";
import { parseHash, buildRoute, resolvePRFile } from "@/lib/routing/route";
import { parseHash as legacyParseHash } from "@/lib/hash-router";

describe("routing/route", () => {
  it("f84_round_trips_path_links_with_spaces_percent_hash_and_unicode", () => {
    const paths = ["docs/my file.md", "docs/100%.md", "docs/a#b.md", "docs/café/日本.md"];
    for (const path of paths) {
      const built = buildRoute({ type: "pr", repoFullName: "acme/widgets", prNumber: 7, file: { kind: "path", path } });
      expect(parseHash(built)).toMatchObject({ type: "pr", prNumber: 7, file: { kind: "path", path } });
      const blob = buildRoute({ type: "file", repoFullName: "acme/widgets", branch: "feat/x y", filePath: path });
      expect(parseHash(blob)).toMatchObject({ type: "file", branch: "feat/x y", filePath: path });
    }
    const withQuery = buildRoute({ type: "pr", repoFullName: "a/b", prNumber: 1, anchor: "x & y", mode: "split" });
    expect(withQuery).toBe("#/a/b/pull/1?anchor=x%20%26%20y&mode=split");
    expect(parseHash(withQuery)).toMatchObject({ anchor: "x & y", mode: "split" });
    expect(buildRoute({ type: "pr", repoFullName: "a/b", prNumber: 1 })).toBe("#/a/b/pull/1");
  });

  it("f84_file_3_is_a_path_and_files_3_is_an_index", () => {
    expect(parseHash("#/a/b/pull/1/file/3")).toMatchObject({ file: { kind: "path", path: "3" } });
    expect(parseHash("#/a/b/pull/1/files/3")).toMatchObject({ file: { kind: "index", index: 3 } });
    expect(parseHash("#/a/b/pull/1/file/")).toEqual({ type: "none" });
    expect(parseHash("#/a/b/pull/1/file/%E0%A4%A")).toEqual({ type: "none" });
  });

  it("f85_legacy_index_link_parses_and_is_never_built", () => {
    const route = parseHash("#/a/b/pull/1/files/2");
    expect(route.file).toEqual({ kind: "index", index: 2 });
    expect(buildRoute(route)).toBe("#/a/b/pull/1");
    expect(legacyParseHash("#/a/b/pull/1/files/2")).toEqual({
      type: "pr", owner: "a", repo: "b", repoFullName: "a/b", prNumber: 1, prFileIdx: 2,
    });
  });

  it("f84_resolve_pr_file_by_path_index_and_missing", () => {
    const paths = ["a.md", "dir/b.md"];
    expect(resolvePRFile(undefined, paths)).toEqual({ ok: true, index: 0 });
    expect(resolvePRFile({ kind: "path", path: "dir/b.md" }, paths)).toEqual({ ok: true, index: 1 });
    expect(resolvePRFile({ kind: "path", path: "zzz.md" }, paths)).toEqual({ ok: false, reason: "no-such-path" });
    expect(resolvePRFile({ kind: "index", index: 1 }, paths)).toEqual({ ok: true, index: 1 });
    expect(resolvePRFile({ kind: "index", index: 2 }, paths)).toEqual({ ok: false, reason: "index-out-of-range" });
    expect(resolvePRFile(undefined, [])).toEqual({ ok: false, reason: "index-out-of-range" });
  });

  it("f86_mode_query_parses_and_unknown_is_dropped", () => {
    expect(parseHash("#/a/b/pull/1?mode=preview").mode).toBe("preview");
    expect(parseHash("#/a/b/pull/1?mode=Preview").mode).toBeUndefined();
    expect(parseHash("#/a/b/pull/1?mode=bogus&anchor=x")).toMatchObject({ type: "pr", anchor: "x" });
    expect(parseHash("#/a/b/pull/1?mode=bogus").mode).toBeUndefined();
    expect(parseHash("#/a/b/pull/1?mode=&other=1").mode).toBeUndefined();
  });
});
