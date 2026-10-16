/** GitHub identifies a PR file's diff by the SHA-256 of its repository path. */
export async function githubReviewFileUrl(repo: string, pr: number, path: string): Promise<string> {
  const base = `https://github.com/${repo.split("/").map(encodeURIComponent).join("/")}/pull/${pr}/files`;
  if (!globalThis.crypto?.subtle) return base;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${base}#diff-${hash}`;
}
