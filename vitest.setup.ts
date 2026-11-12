import { beforeEach } from "vitest";

// The remembered view mode lives in localStorage, which jsdom keeps for the whole
// file; each test starts without one so a mode picked in one test does not open the next.
beforeEach(() => {
  try { localStorage.removeItem("mardoc_view_mode"); } catch { /* no storage in this environment */ }
});
