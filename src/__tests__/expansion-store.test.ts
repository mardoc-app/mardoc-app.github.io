import { describe, it, expect, vi } from "vitest";
import { load, save, EXPANSION_KEY } from "@/lib/expansion-store";

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(EXPANSION_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

describe("expansion-store", () => {
  it("f82_store_round_trips_per_repo_and_ref", () => {
    const s = memory();
    save(s, "o/r", "main", new Set(["a", "a/b"]));
    save(s, "o/r", "dev", new Set(["x"]));
    save(s, "o/other", "main", new Set(["y"]));
    expect(Array.from(load(s, "o/r", "main")).sort()).toEqual(["a", "a/b"]);
    expect(Array.from(load(s, "o/r", "dev"))).toEqual(["x"]);
    expect(Array.from(load(s, "o/other", "main"))).toEqual(["y"]);
    expect(load(s, "o/r", "none").size).toBe(0);
    expect(Object.keys(JSON.parse(s.data.get(EXPANSION_KEY)!))).toEqual(["o/r@main", "o/r@dev", "o/other@main"]);
  });

  it("f82_store_keeps_20_entries_evicting_the_oldest", () => {
    const s = memory();
    for (let i = 0; i < 21; i++) save(s, "o/r", `b${i}`, new Set([`f${i}`]));
    expect(load(s, "o/r", "b0").size).toBe(0);
    expect(load(s, "o/r", "b1").size).toBe(1);
    expect(Object.keys(JSON.parse(s.data.get(EXPANSION_KEY)!))).toHaveLength(20);
    // saving an existing entry makes it newest, so b2 goes next, not b1
    save(s, "o/r", "b1", new Set(["f1", "g"]));
    save(s, "o/r", "b21", new Set(["z"]));
    expect(load(s, "o/r", "b1").size).toBe(2);
    expect(load(s, "o/r", "b2").size).toBe(0);
    expect(Object.keys(JSON.parse(s.data.get(EXPANSION_KEY)!))).toHaveLength(20);
  });

  it("f82_store_caps_200_paths", () => {
    const s = memory();
    const big = new Set(Array.from({ length: 500 }, (_, i) => `d${String(i).padStart(3, "0")}`));
    save(s, "o/r", "main", big);
    expect(JSON.parse(s.data.get(EXPANSION_KEY)!)["o/r@main"]).toHaveLength(200);
    expect(load(s, "o/r", "main").size).toBe(200);
    const raw = JSON.stringify({ "o/r@main": Array.from(big) });
    expect(load(memory(raw), "o/r", "main").size).toBe(200);
  });

  it("f82_store_loads_empty_on_corrupt_input", () => {
    const bad = [
      "{not json", "null", "42", "\"str\"", "[]", "[1,2]",
      JSON.stringify({ "o/r@main": "nope" }),
      JSON.stringify({ "o/r@main": { a: 1 } }),
      JSON.stringify({ "o/r@main": [1, null, {}] }),
      "",
    ];
    for (const text of bad) expect(load(memory(text), "o/r", "main").size).toBe(0);
    expect(Array.from(load(memory(JSON.stringify({ "o/r@main": ["a", 1, "b"] })), "o/r", "main"))).toEqual(["a", "b"]);
    // a throwing store neither loads nor saves loudly
    const boom = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(load(boom, "o/r", "main").size).toBe(0);
    expect(() => save(boom, "o/r", "main", new Set(["a"]))).not.toThrow();
    // saving over a corrupt value replaces it
    const s = memory("{broken");
    save(s, "o/r", "main", new Set(["a"]));
    expect(Array.from(load(s, "o/r", "main"))).toEqual(["a"]);
  });

  it("f82_store_uses_only_the_given_store", () => {
    const touched = vi.fn(() => { throw new Error("localStorage must not be used"); });
    vi.stubGlobal("localStorage", new Proxy({}, { get: touched, set: touched, has: touched }));
    try {
      const plain: Record<string, string> = {};
      const store = {
        getItem: (k: string) => (k in plain ? plain[k] : null),
        setItem: (k: string, v: string) => { plain[k] = v; },
      };
      save(store, "o/r", "main", new Set(["a"]));
      expect(Array.from(load(store, "o/r", "main"))).toEqual(["a"]);
      expect(Object.keys(plain)).toEqual([EXPANSION_KEY]);
      expect(touched).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
