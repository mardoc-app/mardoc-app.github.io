// The only runtime globals domain code (LR-10, LR-11) may name besides ES2022:
// pure Web-standard value helpers. Anything else (fetch, window, location, ...)
// does not resolve under tsconfig.domain.json, so it fails the type check (CR-8).
declare class URL {
  constructor(url: string, base?: string);
  searchParams: URLSearchParams;
  toString(): string;
}
declare class URLSearchParams {
  constructor(init?: string | Record<string, string>);
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  toString(): string;
}
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare function btoa(data: string): string;
declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
  subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> };
};
