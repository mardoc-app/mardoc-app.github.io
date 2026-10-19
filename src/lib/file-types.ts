/** Shared file-type detection helpers. */

export function isMarkdownFile(name: string): boolean {
  return name.endsWith(".md") || name.endsWith(".mdx");
}

export function isHtmlFile(name: string): boolean {
  return name.endsWith(".html") || name.endsWith(".htm");
}

/** Returns true for any file type MarDoc can render (markdown or HTML). */
export function isDocumentFile(name: string): boolean {
  return isMarkdownFile(name) || isHtmlFile(name);
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp",
};

export function imageMimeType(path: string): string | undefined {
  return IMAGE_MIME_TYPES[path.split(".").pop()?.toLowerCase() || ""];
}

export function isImageFile(path: string): boolean {
  return !!imageMimeType(path);
}
