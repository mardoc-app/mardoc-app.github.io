/** Instance-owned LRU. Account for source keys as well as generated output. */
export function createRenderCache(maxEntries = 256, maxBytes = 2 * 1024 * 1024) {
  const entries = new Map<string, string>();
  let bytes = 0;
  return (source: string, render: (source: string) => string): string => {
    const cached = entries.get(source);
    if (cached !== undefined) {
      entries.delete(source); entries.set(source, cached);
      return cached;
    }
    const value = render(source);
    const size = (source.length + value.length) * 2;
    if (size > maxBytes) return value;
    entries.set(source, value); bytes += size;
    while (entries.size > maxEntries || bytes > maxBytes) {
      const key = entries.keys().next().value!;
      bytes -= (key.length + entries.get(key)!.length) * 2;
      entries.delete(key);
    }
    return value;
  };
}
