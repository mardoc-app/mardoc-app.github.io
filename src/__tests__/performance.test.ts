import { afterEach, it, expect, vi } from "vitest";
import { measureOperation } from "@/lib/performance";
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("does not record timings unless enabled", async () => {
  const measure = vi.fn(); vi.stubGlobal("performance", {measure});
  expect(await measureOperation("document-fetch", async () => "content")).toBe("content");
  expect(measure).not.toHaveBeenCalled();
});
it("bounds entries and preserves results and failures without recording content", async () => {
  localStorage.setItem("mardoc_profile", "1");
  const measure = vi.fn(), clearMeasures = vi.fn();
  vi.stubGlobal("performance", {now: () => 10, measure, clearMeasures, getEntriesByName: () => new Array(50)});
  expect(await measureOperation("document-fetch", async () => "private content")).toBe("private content");
  expect(clearMeasures).toHaveBeenCalledWith("mardoc:document-fetch");
  expect(measure).toHaveBeenCalledWith("mardoc:document-fetch", {start:10,end:10});
  measure.mockImplementation(() => { throw new Error("unsupported"); });
  await expect(measureOperation("document-fetch", async () => { throw new Error("original"); })).rejects.toThrow("original");
});
