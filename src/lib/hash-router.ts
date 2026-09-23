/**
 * Lightweight hash-based router for GitHub Pages (no server-side routing).
 *
 * URL scheme (mirrors GitHub):
 *   /#/{owner}/{repo}/blob/{branch}/{path}       → file view
 *   /#/{owner}/{repo}/pull/{number}               → PR diff view
 *   /#/{owner}/{repo}/pull/{number}/files/{idx}   → specific file in PR
 *   /#/{owner}/{repo}                             → repo root
 */

export interface HashRoute {
  type: "file" | "pr" | "repo" | "none";
  owner?: string;
  repo?: string;
  repoFullName?: string;
  branch?: string;
  filePath?: string;
  prNumber?: number;
  prFileIdx?: number;
  anchor?: string;
}

export function parseHash(hash: string): HashRoute {
  try {
    const [route, query] = hash.split("?");
    const anchor = new URLSearchParams(query || "").get("anchor") || undefined;
    const parts = route.replace(/^#\/?/, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return { type: "none" };
    const [owner, repo] = parts.slice(0, 2).map(decodeURIComponent);
    const common = { anchor, owner, repo, repoFullName: `${owner}/${repo}` };
    if (parts.length === 2) return { type: "repo", ...common };
    if (parts[2] === "tree" && parts.length === 4 && parts[3]) {
      return { type: "repo", ...common, branch: decodeURIComponent(parts[3]) };
    }
    if (parts[2] === "blob" && parts.length >= 5 && parts[3] && parts.slice(4).every(Boolean)) {
      return { type: "file", ...common, branch: decodeURIComponent(parts[3]),
        filePath: parts.slice(4).map(decodeURIComponent).join("/") };
    }
    const positive = (s: string) => /^[1-9]\d*$/.test(s) && Number.isSafeInteger(Number(s));
    const index = (s: string) => /^(0|[1-9]\d*)$/.test(s) && Number.isSafeInteger(Number(s));
    if (parts[2] === "pull" && positive(parts[3] || "")) {
      if (parts.length === 4) return { type: "pr", ...common, prNumber: Number(parts[3]) };
      if (parts.length === 6 && parts[4] === "files" && index(parts[5])) {
        return { type: "pr", ...common, prNumber: Number(parts[3]), prFileIdx: Number(parts[5]) };
      }
    }
    return { type: "none" };
  } catch {
    return { type: "none" }; // Malformed percent escapes are invalid links, not render crashes.
  }
}

export function buildBranchHash(repoFullName: string, branch: string): string {
  return `${buildRepoHash(repoFullName)}/tree/${encodeURIComponent(branch)}`;
}

export function buildFileHash(repoFullName: string, branch: string, filePath: string): string {
  return `${buildRepoHash(repoFullName)}/blob/${encodeURIComponent(branch)}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

export function buildPRHash(repoFullName: string, prNumber: number, fileIdx?: number, anchor?: string): string {
  const base = `#/${repoFullName}/pull/${prNumber}`;
  const route = fileIdx !== undefined && fileIdx > 0 ? `${base}/files/${fileIdx}` : base;
  return anchor ? `${route}?anchor=${encodeURIComponent(anchor)}` : route;
}

export function buildRepoHash(repoFullName: string): string {
  return `#/${repoFullName}`;
}
