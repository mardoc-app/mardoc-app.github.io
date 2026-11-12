import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadMode, saveMode } from "@/lib/routing/route-adapter";

const KEY = "mardoc_view_mode";

describe("view mode storage (F-88)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("f88_load_and_save_mode_round_trip_per_kind", () => {
    expect(loadMode("md")).toBeUndefined();
    saveMode("md", "preview");
    saveMode("html", "base");
    expect(loadMode("md")).toBe("preview");
    expect(loadMode("html")).toBe("base");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ md: "preview", html: "base" });
  });

  it("f88_load_and_save_mode_corrupt_json_reads_as_undefined", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadMode("md")).toBeUndefined();
    saveMode("md", "split");
    expect(loadMode("md")).toBe("split");
  });

  it("f88_load_and_save_mode_wrong_shape_reads_as_undefined", () => {
    for (const raw of ["null", "[]", "\"preview\"", "7", "{\"md\":3}", "{\"md\":{\"a\":1}}"]) {
      localStorage.setItem(KEY, raw);
      expect(loadMode("md"), raw).toBeUndefined();
    }
  });

  it("f88_load_and_save_mode_unknown_token_reads_as_undefined", () => {
    localStorage.setItem(KEY, JSON.stringify({ md: "sideways", html: "base" }));
    expect(loadMode("md")).toBeUndefined();
    expect(loadMode("html")).toBe("base");
  });

  it("f88_load_and_save_mode_blocked_storage_never_throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadMode("md")).toBeUndefined();
    expect(() => saveMode("md", "split")).not.toThrow();
  });
});
