// T-22 (I-16, NF-15): the Worker never logs. Every console method is spied
// in every test, and a test fails if any of them was called.
import { afterEach, beforeEach, expect, vi, type MockInstance } from "vitest";

const METHODS = [
  "log", "info", "warn", "error", "debug", "trace", "dir", "dirxml", "table",
  "group", "groupCollapsed", "groupEnd", "count", "countReset", "time",
  "timeEnd", "timeLog", "assert",
] as const;

let spies: Array<[string, MockInstance]> = [];

beforeEach(() => {
  const c = console as unknown as Record<string, unknown>;
  spies = METHODS.filter((m) => typeof c[m] === "function").map(
    (m) => [m, vi.spyOn(console, m).mockImplementation(() => {})] as [string, MockInstance],
  );
});

afterEach(() => {
  const called = spies.filter(([, s]) => s.mock.calls.length > 0).map(([m]) => m);
  for (const [, s] of spies) s.mockRestore();
  spies = [];
  expect(called, "t22_no_console: console methods were called").toEqual([]);
});
