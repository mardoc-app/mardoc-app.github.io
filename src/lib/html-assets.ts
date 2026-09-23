/**
 * Rewrite relative asset URLs (images, links) in HTML content so they
 * resolve against the GitHub raw content CDN.
 */
export function rewriteHtmlAssetUrls(
  html: string,
  repoFullName: string,
  ref: string,
  filePath: string
): string {
  const [owner, repo] = repoFullName.split("/");
  const fileDir = filePath.split("/").slice(0, -1).join("/");

  function resolveRelative(src: string): string | null {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return null;

    let resolvedPath: string;
    if (src.startsWith("/")) {
      resolvedPath = src.slice(1);
    } else {
      const parts = [...fileDir.split("/").filter(Boolean), ...src.split("/")];
      const resolved: string[] = [];
      for (const p of parts) {
        if (p === ".." && resolved.length) resolved.pop();
        else if (p !== "." && p !== "") resolved.push(p);
      }
      resolvedPath = resolved.join("/");
    }

    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${resolvedPath.split("/").map(encodeURIComponent).join("/")}`;
  }

  // Rewrite src and href attributes on img, link, script, a, source, video, audio
  return html.replace(
    /(<(?:img|link|script|source|video|audio)\s[^>]*?(?:src|href)=")([^"]+)("[^>]*?>)/gi,
    (_match, before, url, after) => {
      const resolved = resolveRelative(url);
      return resolved ? `${before}${resolved}${after}` : _match;
    }
  );
}

