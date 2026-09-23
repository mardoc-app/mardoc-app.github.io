import { afterEach, expect, it, vi } from "vitest";
import { RequestCache } from "@/lib/request-cache";
import { abortableDelay } from "@/lib/abort";
import { fetchFileContent, initOctokit, resetGitHubSession } from "@/lib/github-api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
afterEach(() => { resetGitHubSession(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("keeps a shared download alive until its last consumer leaves", async () => {
  const cache = new RequestCache<string>();
  const pending = deferred<string>();
  const loader = vi.fn((_signal: AbortSignal) => pending.promise);
  const first = new AbortController(), second = new AbortController();
  const a = cache.load("file", loader, true, first.signal);
  const b = cache.load("file", loader, true, second.signal);
  await Promise.resolve();
  first.abort();
  await expect(a).rejects.toMatchObject({ name: "AbortError" });
  expect(loader.mock.calls[0][0].aborted).toBe(false);
  pending.resolve("content");
  await expect(b).resolves.toBe("content");
  expect(cache.get("file")).toBe("content");
  expect(loader).toHaveBeenCalledTimes(1);
});

it("cancels the last consumer and permits immediate revisit without stale cache writes", async () => {
  const cache = new RequestCache<string>();
  const old = deferred<string>(), next = deferred<string>();
  const loader = vi.fn((_signal: AbortSignal) => old.promise);
  const controller = new AbortController();
  const first = cache.load("file", loader, true, controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  expect(loader.mock.calls[0][0].aborted).toBe(true);
  const replacement = cache.load("file", () => next.promise);
  old.resolve("obsolete");
  await Promise.resolve(); await Promise.resolve();
  expect(cache.get("file")).toBeUndefined();
  const also = cache.load("file", () => { throw new Error("Replacement lost"); });
  next.resolve("current");
  expect(await Promise.all([replacement, also])).toEqual(["current", "current"]);
  expect(cache.get("file")).toBe("current");
});

it("rejects pre-aborted cache hits and skips loaders cancelled before starting", async () => {
  const cache = new RequestCache<string>();
  const controller = new AbortController();
  const loader = vi.fn(async () => "new");
  const pending = cache.load("file", loader, true, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  cache.set("cached", "old");
  await expect(cache.load("cached", loader, true, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(loader).not.toHaveBeenCalled();
});

it("protects consumers without a signal and aborts shared reads on session clear", async () => {
  const cache = new RequestCache<string>();
  const pending = deferred<string>();
  const loader = vi.fn((_signal: AbortSignal) => pending.promise);
  const controller = new AbortController();
  const first = cache.load("file", loader, true, controller.signal);
  const retained = cache.load("file", loader);
  await Promise.resolve();
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  expect(loader.mock.calls[0][0].aborted).toBe(false);
  cache.clear();
  expect(loader.mock.calls[0][0].aborted).toBe(true);
  pending.resolve("old");
  await retained;
  expect(cache.get("file")).toBeUndefined();
});

it("clears a retry timer immediately on cancellation", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const wait = abortableDelay(4000, controller.signal);
  controller.abort();
  await expect(wait).rejects.toMatchObject({ name: "AbortError" });
  expect(vi.getTimerCount()).toBe(0);
});

it("passes cancellation through Octokit to fetch and never retries an aborted download", async () => {
  let transportSignal!: AbortSignal;
  const fetcher = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    transportSignal = options.signal!;
    transportSignal.addEventListener("abort", () => reject(transportSignal.reason), { once: true });
  }));
  vi.stubGlobal("fetch", fetcher);
  initOctokit("fake");
  const controller = new AbortController();
  const read = fetchFileContent("acme/docs", "deck.html", "a".repeat(40), controller.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(read).rejects.toMatchObject({ name: "AbortError" });
  expect(transportSignal.aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("stops Octokit retry backoff when navigation changes", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValue(new Response('{"message":"unavailable"}', {
    status: 503, headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetcher);
  const client = initOctokit("fake");
  const controller = new AbortController();
  const read = client.repos.getContent({ owner: "acme", repo: "docs", path: "a.md", request: { signal: controller.signal } });
  const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  controller.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("cancels the large-file blob fallback with the same shared signal", async () => {
  const client = initOctokit("fake");
  const content = vi.fn().mockResolvedValue({data:{type:"file",encoding:"none",sha:"blob"}});
  const pending = deferred<any>();
  const blob = vi.fn().mockReturnValue(pending.promise);
  client.repos.getContent = content as any;
  client.git.getBlob = blob as any;
  const controller = new AbortController();
  const read = fetchFileContent("acme/docs", "deck.html", "a".repeat(40), controller.signal);
  await vi.waitFor(() => expect(blob).toHaveBeenCalledTimes(1));
  const signal = blob.mock.calls[0][0].request.signal;
  expect(signal).toBe(content.mock.calls[0][0].request.signal);
  controller.abort();
  await expect(read).rejects.toMatchObject({name:"AbortError"});
  expect(signal.aborted).toBe(true);
  pending.resolve({data:{encoding:"base64",content:btoa("late")}});
});
