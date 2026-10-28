// The one Node API the tests use as an independent S256 oracle. The Worker
// tsconfig has only Workers types, so this declares just what is needed.
declare module "node:crypto" {
  interface Hash {
    update(data: string, encoding?: "ascii" | "utf8"): Hash;
    digest(encoding: "base64url" | "hex"): string;
  }
  export function createHash(algorithm: "sha256"): Hash;
}
