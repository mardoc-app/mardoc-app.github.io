import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useTreeExpansion, setTreeExpansionStore, resetTreeExpansion, type TreeExpansionInput } from "@/lib/use-tree-expansion";
import { EXPANSION_KEY } from "@/lib/expansion-store";

let reads: string[], writes: string[], data: Map<string, string>;
const spy = {
  getItem: (k: string) => { reads.push(k); return data.get(k) ?? null; },
  setItem: (k: string, v: string) => { writes.push(k); data.set(k, v); },
};
type Api = ReturnType<typeof useTreeExpansion>;
function Probe({ input, out }: { input: TreeExpansionInput; out: { current?: Api } }) {
  out.current = useTreeExpansion(input);
  return null;
}
const saved = () => JSON.parse(data.get(EXPANSION_KEY) ?? "{}");

beforeEach(() => { reads = []; writes = []; data = new Map(); setTreeExpansionStore(spy); });
afterEach(() => { cleanup(); setTreeExpansionStore(null); });

describe("use-tree-expansion", () => {
  it("f82_no_load_or_save_under_a_guessed_main", () => {
    const out: { current?: Api } = {};
    const input = { repo: "o/r", treeRef: null, selectedPath: "docs/a/x.md" };
    const { rerender } = render(<Probe input={input} out={out} />);
    expect(Array.from(out.current!.expanded).sort()).toEqual(["docs", "docs/a"]);
    act(() => out.current!.toggle("src"));
    expect(out.current!.expanded.has("src")).toBe(true);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);

    rerender(<Probe input={{ ...input, treeRef: "dev" }} out={out} />);
    expect(reads.length).toBeGreaterThan(0);
    expect(new Set(reads)).toEqual(new Set([EXPANSION_KEY]));
    expect(Object.keys(saved())).toEqual(["o/r@dev"]);
    // The selected file's folders are revealed again under the real ref; the
    // in-memory state is not carried over (WP11R-7).
    expect(saved()["o/r@dev"]).toEqual(["docs", "docs/a"]);
    expect(Object.keys(saved()).some((k) => k.endsWith("@main"))).toBe(false);
  });

  it("f82_two_sidebars_share_one_state", () => {
    const a: { current?: Api } = {}, b: { current?: Api } = {};
    const input = { repo: "o/r", treeRef: "dev", selectedPath: null };
    render(<><Probe input={input} out={a} /><Probe input={input} out={b} /></>);
    act(() => a.current!.toggle("docs"));
    expect(b.current!.expanded.has("docs")).toBe(true);
    expect(a.current!.expanded).toBe(b.current!.expanded);
    act(() => b.current!.toggle("src"));
    expect(Array.from(a.current!.expanded).sort()).toEqual(["docs", "src"]);
    expect(writes).toHaveLength(2);
    expect(saved()["o/r@dev"]).toEqual(["docs", "src"]);
    act(() => a.current!.collapseAll());
    expect(b.current!.expanded.size).toBe(0);
    expect(saved()["o/r@dev"]).toEqual([]);
  });

  it("f82_selected_path_reveals_again_and_storage_is_loaded_once", () => {
    data.set(EXPANSION_KEY, JSON.stringify({ "o/r@dev": ["keep"] }));
    const out: { current?: Api } = {};
    const base = { repo: "o/r", treeRef: "dev" };
    const { rerender } = render(<Probe input={{ ...base, selectedPath: "a/b/x.md" }} out={out} />);
    expect(Array.from(out.current!.expanded).sort()).toEqual(["a", "a/b", "keep"]);
    rerender(<Probe input={{ ...base, selectedPath: "__local__/y.md" }} out={out} />);
    rerender(<Probe input={{ ...base, selectedPath: "c/y.md" }} out={out} />);
    expect(Array.from(out.current!.expanded).sort()).toEqual(["a", "a/b", "c", "keep"]);
    // one load, plus the one read each save makes before it writes
    expect(reads).toHaveLength(1 + writes.length);
  });

  it("f82_memory_state_never_reaches_a_stored_branch", () => {
    // WP11R-7: folders held while the ref is unknown stay in memory.
    data.set(EXPANSION_KEY, JSON.stringify({ "o/r@dev": ["stored"] }));
    const out: { current?: Api } = {};
    const input = { repo: "o/r", treeRef: null, selectedPath: null };
    const { rerender } = render(<Probe input={input} out={out} />);
    act(() => out.current!.toggle("early"));
    rerender(<Probe input={{ ...input, treeRef: "dev" }} out={out} />);
    expect(Array.from(out.current!.expanded).sort()).toEqual(["stored"]);
    rerender(<Probe input={{ ...input, treeRef: "other" }} out={out} />);
    expect(out.current!.expanded.size).toBe(0);
    expect(Object.keys(saved())).toEqual(["o/r@dev"]);
  });

  it("f82_reset_keeps_mounted_trees_live", () => {
    // WP11R-8: a reset while repo and ref stay the same must not orphan the subscription
    const out: { current?: Api } = {};
    render(<Probe input={{ repo: null, treeRef: null, selectedPath: null }} out={out} />);
    act(() => resetTreeExpansion());
    act(() => out.current!.toggle("docs"));
    expect(Array.from(out.current!.expanded)).toEqual(["docs"]);
  });

  it("f83_collapse_all_saves_an_empty_set", () => {
    data.set(EXPANSION_KEY, JSON.stringify({ "o/r@dev": ["a", "a/b"], "o/r@main": ["z"] }));
    const out: { current?: Api } = {};
    render(<Probe input={{ repo: "o/r", treeRef: "dev", selectedPath: null }} out={out} />);
    expect(out.current!.expanded.size).toBe(2);
    act(() => out.current!.collapseAll());
    expect(out.current!.expanded.size).toBe(0);
    expect(saved()["o/r@dev"]).toEqual([]);
    expect(saved()["o/r@main"]).toEqual(["z"]);
  });
});
