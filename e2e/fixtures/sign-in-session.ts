/**
 * Helpers for the WP-8 sign-in specs (the stage 1 gate and the T-31
 * journeys). They sit on top of WP-5's `auth-mocks.ts`: the Auth Worker and
 * GitHub's `/user` and installation calls are mocked on the context, and the
 * repository reads here are mocked on the page. Everything is simulated; the
 * real Worker is T-32 (`e2e/sign-in-real-worker.spec.ts`).
 *
 * Sign-in starts from the real Settings button, so the pop-up opens inside a
 * click. `window.__MARDOC_E2E__` exposes the session (never the token) for
 * the assertions.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { mockAuth, type AuthMockOptions, type AuthMocks } from "./auth-mocks";
import { waitForHydration } from "./helpers";

export const PAT = "ghp_seeded_personal_token_e2e";
export const FILE = "docs/spec.md";
export const HEADING = "Spec under review";
export const fileRoute = (repo = "acme/docs", path = FILE) => `/#/${repo}/blob/main/${path}`;

export type Session = {
  status: string;
  sessionKey: string | null;
  lastLogin: string | null;
  lastError: string | null;
};

export type RepoRead = { path: string; authorization: string | null };

export type RepoMocks = {
  /** Repositories the token can read; any other `/repos/...` answers 404. */
  allow(...repos: string[]): void;
  reads: RepoRead[];
};

/**
 * GitHub repository reads for one Markdown file per allowed repo, recording
 * the auth header. `/user` and installations fall through to the auth mocks;
 * `/user/repos` answers a repo the token must not list (F-40: a sign-in token
 * lists installations instead). Nothing reaches the real GitHub.
 */
export async function mockRepos(page: Page, allowed: string[] = ["acme/docs"]): Promise<RepoMocks> {
  const allow = new Set(allowed);
  const reads: RepoRead[] = [];
  await page.route("https://raw.githubusercontent.com/**", (route) => route.abort());
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    if (path === "/user" || path.startsWith("/user/installations")) return route.fallback();
    const authorization = (await route.request().allHeaders())["authorization"] ?? null;
    reads.push({ path, authorization });
    const ok = (data: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    const notFound = () =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Not Found" }) });
    if (path === "/user/repos") {
      return ok([{ full_name: "acme/not-installed", name: "not-installed", owner: { login: "acme" }, private: true, description: "" }]);
    }
    const m = path.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/);
    if (!m || !allow.has(m[1])) return notFound();
    const rest = m[2] ?? "";
    if (rest.startsWith("/commits/")) return ok({ sha: "a".repeat(40) });
    if (rest.startsWith("/contents/")) {
      return ok({ encoding: "base64", content: Buffer.from(`# ${HEADING}\n\nBody text.`).toString("base64") });
    }
    if (rest.startsWith("/git/trees/")) {
      return ok({ tree: [{ path: "docs", type: "tree", sha: "dir" }, { path: FILE, type: "blob", sha: "blob" }] });
    }
    if (rest === "/branches") return ok([{ name: "main" }]);
    if (rest === "/pulls") return ok([]);
    if (rest === "") return ok({ default_branch: "main" });
    return notFound();
  });
  return { allow: (...repos) => repos.forEach((r) => allow.add(r)), reads };
}

export type SetUp = { auth: AuthMocks; repos: RepoMocks };

/** Mocks, the test hook, an optional seeded PAT, then the page at `route`. */
export async function setUp(
  page: Page,
  context: BrowserContext,
  options: AuthMockOptions & { pat?: boolean; route?: string; allowed?: string[] } = {},
): Promise<SetUp> {
  const { pat = false, route = fileRoute(), allowed, ...authOptions } = options;
  await page.addInitScript((token) => {
    (window as unknown as { __MARDOC_E2E__: boolean }).__MARDOC_E2E__ = true;
    // Seed once per tab; a reload keeps whatever the app left.
    if (token && window === window.top && !window.opener && !sessionStorage.getItem("e2e-seeded")) {
      localStorage.setItem("mardoc_github_token", token);
      sessionStorage.setItem("e2e-seeded", "1");
    }
  }, pat ? PAT : null);
  const auth = await mockAuth(context, { installations: [{ id: 7, account: "acme", repositories: ["acme/docs"] }], ...authOptions });
  const repos = await mockRepos(page, allowed);
  await page.goto(route);
  await waitForHydration(page);
  await page.waitForFunction(() => !!(window as unknown as { __mardocAuth?: unknown }).__mardocAuth);
  return { auth, repos };
}

export const session = (page: Page): Promise<Session> =>
  page.evaluate(() => (window as unknown as { __mardocAuth: { getSession(): Session } }).__mardocAuth.getSession());

export async function waitForSession(page: Page, check: Partial<Session>, timeout = 10_000): Promise<Session> {
  await page.waitForFunction(
    (want) => {
      const s = (window as unknown as { __mardocAuth: { getSession(): Record<string, unknown> } }).__mardocAuth.getSession();
      return Object.entries(want).every(([k, v]) => s[k] === v);
    },
    check,
    { timeout },
  );
  return session(page);
}

export async function openSettings(page: Page, tab: "GitHub Connection" | "Repository" = "GitHub Connection") {
  const dialog = page.locator("div.fixed.inset-0");
  if (!(await dialog.getByRole("button", { name: "GitHub Connection" }).isVisible().catch(() => false))) {
    await page.getByTitle("Settings", { exact: true }).click();
  }
  await page.getByRole("button", { name: tab, exact: true }).click();
}

/** A repository in the Settings picker. */
export const pickerRepo = (page: Page, fullName: string) =>
  page.locator("div.fixed.inset-0").getByRole("button", { name: fullName, exact: true });

/** The X in the Settings header. */
export async function closeSettings(page: Page) {
  await page.locator("div.fixed.inset-0 h2", { hasText: "Settings" }).locator("xpath=../..").getByRole("button").click();
}

/** Settings → GitHub Connection → Sign in with GitHub; resolves with the pop-up. */
export async function signInFromSettings(page: Page) {
  await openSettings(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with GitHub" }).click();
  return popup;
}

/**
 * Signs in from Settings and waits until the tab is signed in as `login`.
 * A token with under 10 minutes left lands in `expiring`, not `signed-in`.
 */
export async function signIn(page: Page, login = "octo", status: "signed-in" | "expiring" = "signed-in") {
  const popup = await signInFromSettings(page);
  await waitForSession(page, { status, sessionKey: `sign-in:${login}` });
  return popup;
}

/**
 * Every place web storage could keep a token (F-30, I-10): localStorage,
 * sessionStorage, readable cookies, IndexedDB (every store's records) and
 * Cache Storage (every cached request and body).
 */
export async function webStorageDump(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts: string[] = [document.cookie];
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)!;
        parts.push(k, store.getItem(k) ?? "");
      }
    }
    const dbs = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    for (const info of dbs) {
      if (!info.name) continue;
      parts.push(`idb:${info.name}`);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(info.name!);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const name of Array.from(db.objectStoreNames)) {
        const all = await new Promise<unknown[]>((resolve, reject) => {
          const req = db.transaction(name, "readonly").objectStore(name).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        parts.push(JSON.stringify(all));
      }
      db.close();
    }
    if (typeof caches !== "undefined") {
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) {
          parts.push(request.url);
          const res = await cache.match(request);
          if (res) parts.push(await res.text());
        }
      }
    }
    return parts.join("\n");
  });
}

/** The token the tab sent to `GET /user` (the mocks record it). */
export function tokenSentToUser(auth: AuthMocks): string {
  const call = [...auth.requests.github].reverse().find((r) => r.path === "/user");
  return call?.authorization?.replace(/^token /, "") ?? "";
}

export async function expectHeading(page: Page) {
  await expect(page.locator(".ProseMirror h1")).toHaveText(HEADING);
}
