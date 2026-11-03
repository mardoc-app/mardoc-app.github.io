import { describe, it, expect } from "vitest";
import { parseMode, pickMode, type MdMode, type ViewMode } from "@/lib/routing/view-mode";

const MD_ALL: MdMode[] = ["inline", "split", "suggest", "preview"];

describe("routing/view-mode", () => {
  it("f88_pick_mode_precedence_table", () => {
    const rows: Array<[ViewMode | undefined, ViewMode | undefined, MdMode[], MdMode, MdMode]> = [
      ["preview", "inline", MD_ALL, "inline", "preview"],
      [undefined, "preview", MD_ALL, "inline", "preview"],
      [undefined, undefined, MD_ALL, "inline", "inline"],
      ["split", undefined, ["inline", "suggest", "preview"], "inline", "inline"],
      [parseMode("bogus"), undefined, MD_ALL, "inline", "inline"],
      ["head", undefined, MD_ALL, "inline", "preview"],
      ["base", undefined, MD_ALL, "inline", "inline"],
    ];
    for (const [link, remembered, available, fallback, want] of rows) {
      expect(pickMode({ link, remembered, available, fallback })).toBe(want);
    }
  });

  it("f89_unavailable_or_unknown_mode_falls_back", () => {
    expect(parseMode("bogus")).toBeUndefined();
    expect(parseMode("")).toBeUndefined();
    expect(parseMode(null)).toBeUndefined();
    expect(parseMode("Preview")).toBeUndefined();
    expect(pickMode({ link: "split", available: ["inline"] as MdMode[], fallback: "inline" })).toBe("inline");
    expect(pickMode({ link: "diff", remembered: "head", available: ["inline", "preview"] as MdMode[], fallback: "preview" })).toBe("inline");
    expect(pickMode({ available: [] as MdMode[], fallback: "inline" })).toBe("inline");
  });
});
