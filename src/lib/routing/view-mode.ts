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

const TWINS: Partial<Record<ViewMode, ViewMode>> = {
  inline: "diff", diff: "inline", preview: "head", head: "preview",
};

/**
 * First of: the link's mode, its twin, the remembered mode, its twin, the
 * fallback. Only modes in `available` qualify.
 */
export function pickMode<M extends ViewMode>(i: {
  link?: ViewMode;
  remembered?: ViewMode;
  available: readonly M[];
  fallback: M;
}): M {
  const ok = (m: ViewMode | undefined): m is M => m !== undefined && (i.available as readonly ViewMode[]).includes(m);
  for (const m of [i.link, i.link && TWINS[i.link], i.remembered, i.remembered && TWINS[i.remembered]]) {
    if (ok(m)) return m;
  }
  return i.fallback;
}
