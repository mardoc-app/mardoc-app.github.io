import { describe, expect, it } from "vitest";
import { createGitHub, type FetchLike } from "../src/adapters/github";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const gh = (reply: () => Response | Promise<Response>) =>
  createGitHub({ clientId: "cid", clientSecret: "sec", redirectUri: "https://mardoc.app/api/auth/callback", fetchImpl: (async () => reply()) as FetchLike });

describe("GitHub adapter (T-21, I-13)", () => {
  it("t21_no_refresh_exchange_keeps_only_three_fields (I-13)", async () => {
    const answer = await gh(() =>
      json({ access_token: "ghu_a", expires_in: 28800, refresh_token: "ghr_b", refresh_token_expires_in: 1, scope: "", token_type: "bearer" }),
    ).exchange("c", "v");
    expect(answer).toEqual({ kind: "answered", accessToken: "ghu_a", expiresIn: 28800, error: undefined });
    expect(Object.keys(answer).sort()).toEqual(["accessToken", "error", "expiresIn", "kind"]);
    expect(JSON.stringify(answer)).not.toContain("ghr_");
  });

  it("t20_callback_exchange_non_2xx_bad_json_or_throw_is_failed", async () => {
    for (const reply of [
      () => json({ access_token: "ghu_a", expires_in: 1 }, 500),
      () => json({}, 302),
      () => new Response("<html>"),
      () => json([1]),
      () => json(null),
      () => Promise.reject(new Error("net")),
    ]) {
      expect(await gh(reply).exchange("c", "v")).toEqual({ kind: "failed" });
    }
  });

  it("t23_revoke_outcomes", async () => {
    expect(await gh(() => new Response(null, { status: 204 })).revoke("t")).toBe("revoked");
    expect(await gh(() => new Response(null, { status: 404 })).revoke("t")).toBe("revoked");
    expect(await gh(() => new Response(null, { status: 401 })).revoke("t")).toBe("failed");
    expect(await gh(() => Promise.reject(new Error("net"))).revoke("t")).toBe("failed");
  });
});
