// DISPOSABLE SPIKE WORKER (SP-3). Imports the product Worker unchanged and
// adds exactly one route: GET /api/auth/__sp3, the opener page. Everything
// else is the product module's own behaviour.
import product, { type Env } from "../../../worker/src/index";
import { openerCsp, renderOpenerPage } from "./opener";

const SP3_PATH = "/api/auth/__sp3";

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === SP3_PATH && request.method === "GET") {
      const cspNonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
      return new Response(renderOpenerPage(cspNonce), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": openerCsp(cspNonce),
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return product.fetch(request, env);
  },
};
