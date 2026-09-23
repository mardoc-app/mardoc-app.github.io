/** Session-only LRU plus in-flight deduplication. clear() also fences old writes. */
export class RequestCache<T> {
  private values = new Map<string, { value: T; bytes: number }>();
  private pending = new Map<string, { promise: Promise<T>; controller: AbortController; consumers: number }>();
  private bytes = 0;
  private generation = 0;

  constructor(private maxEntries = 128, private maxBytes = 16 * 1024 * 1024) {}

  get(key: string): T | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    this.values.delete(key);
    this.values.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const bytes = JSON.stringify(value).length * 2;
    const old = this.values.get(key);
    if (old) { this.bytes -= old.bytes; this.values.delete(key); }
    if (bytes > this.maxBytes) return;
    this.values.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.values.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.values.keys().next().value!;
      this.bytes -= this.values.get(oldest)!.bytes;
      this.values.delete(oldest);
    }
  }

  load(key: string, loader: (signal: AbortSignal) => Promise<T>, retain = true, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const cached = retain ? this.get(key) : undefined;
    if (cached !== undefined) return Promise.resolve(cached);
    let entry = this.pending.get(key);
    if (!entry) {
      const generation = this.generation;
      const controller = new AbortController();
      const created = { controller, consumers: 0, promise: null! as Promise<T> };
      created.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return loader(controller.signal);
      }).then(value => {
        if (retain && !controller.signal.aborted && generation === this.generation) this.set(key, value);
        return value;
      }).finally(() => {
        if (this.pending.get(key) === created) this.pending.delete(key);
      });
      this.pending.set(key, created);
      entry = created;
    }
    const shared = entry;
    shared.consumers++;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        if (--shared.consumers === 0 && this.pending.get(key) === shared) {
          this.pending.delete(key);
          shared.controller.abort();
        }
        callback();
      };
      const onAbort = () => finish(() => reject(signal!.reason));
      signal?.addEventListener("abort", onAbort, { once: true });
      shared.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    });
  }

  clear(): void {
    this.generation++;
    this.values.clear();
    this.pending.forEach(entry => entry.controller.abort());
    this.pending.clear();
    this.bytes = 0;
  }
}

export const isCommitSha = (ref: string | undefined): boolean => /^[a-f0-9]{40}$/i.test(ref || "");
