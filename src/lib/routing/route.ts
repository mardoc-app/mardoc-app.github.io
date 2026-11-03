/**
 * The URL contract for hash links (GitHub Pages, no server-side routing).
 *
 *   #/{owner}/{repo}                              repo root
 *   #/{owner}/{repo}/tree/{branch}                branch
 *   #/{owner}/{repo}/blob/{branch}/{path}         file view
 *   #/{owner}/{repo}/pull/{number}                PR diff view
 *   #/{owner}/{repo}/pull/{number}/file/{path}    a file in the PR, by path
 *   #/{owner}/{repo}/pull/{number}/files/{idx}    a file in the PR, by index (read only)
 *   ...?anchor={text}&mode={mode}                 optional query
 *
 * Pure: parsing and building only, no browser state.
 */

import { parseMode, type ViewMode } from "./view-mode";

export type FileRef =
  | { kind: "path"; path: string }
  | { kind: "index"; index: number };

export interface HashRoute {
  type: "file" | "pr" | "repo" | "none";
  owner?: string;
  repo?: string;
  repoFullName?: string;
  branch?: string;
  filePath?: string;
  prNumber?: number;
  file?: FileRef;
  mode?: ViewMode;
  anchor?: string;
}

export type ResolvedPRFile =
  | { ok: true; index: number }
  | { ok: false; reason: "no-such-path" | "index-out-of-range" };

export function parseHash(hash: string): HashRoute {
  try {
    const [route, query] = hash.split("?");
    const params = new URLSearchParams(query || "");
    const anchor = params.get("anchor") || undefined;
    const mode = parseMode(params.get("mode"));
    const parts = route.replace(/^#\/?/, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return { type: "none" };
    const [owner, repo] = parts.slice(0, 2).map(decodeURIComponent);
    const common = { anchor, mode, owner, repo, repoFullName: `${owner}/${repo}` };
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
      const prNumber = Number(parts[3]);
      if (parts.length === 4) return { type: "pr", ...common, prNumber };
      if (parts.length === 6 && parts[4] === "files" && index(parts[5])) {
        return { type: "pr", ...common, prNumber, file: { kind: "index", index: Number(parts[5]) } };
      }
      if (parts[4] === "file" && parts.length >= 6 && parts.slice(5).every(Boolean)) {
        const path = parts.slice(5).map(decodeURIComponent).join("/");
        return { type: "pr", ...common, prNumber, file: { kind: "path", path } };
      }
    }
    return { type: "none" };
  } catch {
    return { type: "none" }; // Malformed percent escapes are invalid links, not render crashes.
  }
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** Builds the path form only; an index file reference is not written. */
export function buildRoute(route: HashRoute): string {
  const full = route.repoFullName ?? `${route.owner}/${route.repo}`;
  let base = `#/${full}`;
  if (route.type === "none") return "#/";
  if (route.type === "repo" && route.branch) base += `/tree/${encodeURIComponent(route.branch)}`;
  if (route.type === "file") {
    base += `/blob/${encodeURIComponent(route.branch ?? "")}/${encodePath(route.filePath ?? "")}`;
  }
  if (route.type === "pr") {
    base += `/pull/${route.prNumber}`;
    if (route.file?.kind === "path") base += `/file/${encodePath(route.file.path)}`;
  }
  const query: string[] = [];
  if (route.anchor) query.push(`anchor=${encodeURIComponent(route.anchor)}`);
  if (route.mode) query.push(`mode=${route.mode}`);
  return query.length ? `${base}?${query.join("&")}` : base;
}

/** Which file of a PR a link names: no reference means the first file. */
export function resolvePRFile(ref: FileRef | undefined, paths: readonly string[]): ResolvedPRFile {
  if (!ref) return paths.length > 0 ? { ok: true, index: 0 } : { ok: false, reason: "index-out-of-range" };
  if (ref.kind === "path") {
    const i = paths.indexOf(ref.path);
    return i >= 0 ? { ok: true, index: i } : { ok: false, reason: "no-such-path" };
  }
  return ref.index >= 0 && ref.index < paths.length
    ? { ok: true, index: ref.index }
    : { ok: false, reason: "index-out-of-range" };
}

export function buildRepoHash(repoFullName: string): string {
  return `#/${repoFullName}`;
}

export function buildBranchHash(repoFullName: string, branch: string): string {
  return `${buildRepoHash(repoFullName)}/tree/${encodeURIComponent(branch)}`;
}

export function buildFileHash(repoFullName: string, branch: string, filePath: string): string {
  return `${buildRepoHash(repoFullName)}/blob/${encodeURIComponent(branch)}/${encodePath(filePath)}`;
}

export function buildPRHash(repoFullName: string, prNumber: number, fileIdx?: number, anchor?: string): string {
  const base = `#/${repoFullName}/pull/${prNumber}`;
  const route = fileIdx !== undefined && fileIdx > 0 ? `${base}/files/${fileIdx}` : base;
  return anchor ? `${route}?anchor=${encodeURIComponent(anchor)}` : route;
}
