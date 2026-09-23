/** Session-only LRU plus in-flight deduplication. clear() also fences old writes. */
export class RequestCache<T> {
  private values = new Map<string, { value: T; bytes: number }>();
  private pending = new Map<string, Promise<T>>();
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

  load(key: string, loader: () => Promise<T>, retain = true): Promise<T> {
    const cached = retain ? this.get(key) : undefined;
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const result = Promise.resolve().then(loader).then(value => {
      if (retain && generation === this.generation) this.set(key, value);
      return value;
    }).finally(() => {
      if (this.pending.get(key) === result) this.pending.delete(key);
    });
    this.pending.set(key, result);
    return result;
  }

  clear(): void {
    this.generation++;
    this.values.clear();
    this.pending.clear();
    this.bytes = 0;
  }
}

export const isCommitSha = (ref: string | undefined): boolean => /^[a-f0-9]{40}$/i.test(ref || "");
