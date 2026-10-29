// The few Node APIs the tests use (an independent S256 oracle and reading
// source files for T-27). The Worker tsconfig has only Workers types, so
// this declares just what is needed.
declare module "node:crypto" {
  interface Hash {
    update(data: string, encoding?: "ascii" | "utf8"): Hash;
    digest(encoding: "base64url" | "hex"): string;
  }
  export function createHash(algorithm: "sha256"): Hash;
}

declare module "node:fs" {
  export function readFileSync(path: URL, encoding: "utf8"): string;
  export function readdirSync(path: URL): string[];
}

interface ImportMeta {
  readonly url: string;
}
