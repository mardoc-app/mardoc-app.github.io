const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Rewrite relative asset URLs (images, links) in HTML content so they
 * resolve against the GitHub raw content CDN.
 *
 * The CDN refuses private repositories, so each rewritten <img> also
 * carries data-gh-* attributes. loadAuthenticatedImages reads them to
 * fetch the image through the contents API with the user's token.
 */
export function rewriteHtmlAssetUrls(
  html: string,
  repoFullName: string,
  ref: string,
  filePath: string
): string {
  const [owner, repo] = repoFullName.split("/");
  const fileDir = filePath.split("/").slice(0, -1).join("/");

  function resolvePath(src: string): string | null {
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
    return resolvedPath;
  }

  const rawUrl = (path: string) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;

  // Rewrite src and href attributes on img, link, script, source, video, audio
  return html.replace(
    /(<(img|link|script|source|video|audio)\s[^>]*?(?:src|href)=")([^"]+)("[^>]*?>)/gi,
    (match, before, tag: string, url, after) => {
      const path = resolvePath(url);
      if (path === null) return match;
      const meta = tag.toLowerCase() === "img" && !/\sdata-gh-path=/i.test(before + after)
        ? ` data-gh-owner="${escapeAttr(owner)}" data-gh-repo="${escapeAttr(repo)}" data-gh-ref="${escapeAttr(ref)}" data-gh-path="${escapeAttr(path)}"`
        : "";
      return `${before}${rawUrl(path)}"${meta}${after.slice(1)}`;
    }
  );
}

