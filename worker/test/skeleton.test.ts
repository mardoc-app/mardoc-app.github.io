import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { AUTH_ROUTES, NONCE_PATTERN } from "../../src/lib/auth/contract";

describe("worker skeleton", () => {
  it("worker_skeleton_refresh_is_404 (C-16)", async () => {
    const res = await worker.fetch(new Request("https://mardoc.app/api/auth/refresh"));
    expect(res.status).toBe(404);
  });

  it("worker_skeleton_imports_contract", () => {
    expect(AUTH_ROUTES.health).toBe("/api/auth/health");
    expect(NONCE_PATTERN.test("a".repeat(22))).toBe(true);
  });
});
