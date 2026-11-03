/**
 * View mode tokens carried in the `mode` query parameter of a link.
 * Pure: no browser state. Mode choice by precedence lives elsewhere.
 */

export type MdMode = "inline" | "split" | "suggest" | "preview";
export type HtmlMode = "diff" | "head" | "base" | "source";
export type BlobMode = "preview" | "source";
export type ViewMode = MdMode | HtmlMode | BlobMode;

const TOKENS: readonly string[] = [
  "inline", "split", "suggest", "preview", "diff", "head", "base", "source",
];

/** The token itself (exact match, lower case), or undefined for anything else. */
export function parseMode(raw: string | null | undefined): ViewMode | undefined {
  return typeof raw === "string" && TOKENS.includes(raw) ? (raw as ViewMode) : undefined;
}
