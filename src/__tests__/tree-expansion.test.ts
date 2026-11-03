import { describe, it, expect } from "vitest";
import { reveal, toggle, collapseAll, serialize, parse } from "@/lib/tree-expansion";

describe("tree-expansion", () => {
  it("f81_reveal_adds_only_ancestors", () => {
    expect(Array.from(reveal(new Set(), "a/b/c.md")).sort()).toEqual(["a", "a/b"]);
    expect(Array.from(reveal(new Set(["x"]), "a/b.md")).sort()).toEqual(["a", "x"]);
    expect(reveal(new Set(), "top.md").size).toBe(0);
    expect(reveal(new Set(), "__local__/x/y.md").size).toBe(0);
    expect(reveal(new Set(), "__new__/x/y.md").size).toBe(0);
    expect(Array.from(reveal(new Set(), "__tests__/a/b.md")).sort()).toEqual(["__tests__", "__tests__/a"]);
  });

  it("f82_parse_is_total_and_bounded", () => {
    expect(parse("{not json").size).toBe(0);
    expect(parse("").size).toBe(0);
    expect(parse('{"a":1}').size).toBe(0);
    expect(parse('"a"').size).toBe(0);
    expect(Array.from(parse('["b", 1, null, "a", {"x":1}]'))).toEqual(["a", "b"]);
    const many = Array.from({ length: 250 }, (_, i) => `dir${String(i).padStart(3, "0")}`);
    const out = parse(JSON.stringify(many));
    expect(out.size).toBe(200);
    expect(Array.from(out)).toEqual(many.slice(0, 200));
    expect(parse(JSON.stringify([...Array(200).fill("a"), "b", "c"]))).toEqual(new Set(["a", "b", "c"]));
    expect(parse(serialize(new Set(["b", "a"])))).toEqual(new Set(["a", "b"]));
    expect(serialize(new Set(["b", "a"]))).toBe('["a","b"]');
  });

  it("f81_toggle_and_collapse_all_return_new_sets", () => {
    const state: ReadonlySet<string> = new Set(["a"]);
    const opened = toggle(state, "b");
    expect(Array.from(opened).sort()).toEqual(["a", "b"]);
    expect(Array.from(toggle(opened, "a"))).toEqual(["b"]);
    expect(collapseAll(state).size).toBe(0);
    expect(Array.from(state)).toEqual(["a"]);
  });
});
