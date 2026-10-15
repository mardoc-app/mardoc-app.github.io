export const MAX_SOURCE_PATCH_CHARS = 200_000;
export const MAX_SOURCE_DIFF_LINES = 2_000;
export const SOURCE_DIFF_PAGE_SIZE = 500;

export interface SourceDiffLine {
  kind: "hunk" | "context" | "addition" | "deletion" | "note";
  text: string;
  oldLine?: number;
  newLine?: number;
}

/** Parse a bounded GitHub unified patch, never repository code as markup. */
export function parseSourceDiff(patch: string | undefined, additions?: number, deletions?: number) {
  const lines: SourceDiffLine[] = [];
  let oldLine = 0, newLine = 0, added = 0, removed = 0;
  let truncated = !!patch && patch.length > MAX_SOURCE_PATCH_CHARS;
  let bounded = (patch || "").slice(0, MAX_SOURCE_PATCH_CHARS);
  if (truncated) { const end = bounded.lastIndexOf("\n"); bounded = end < 0 ? "" : bounded.slice(0, end); }
  const raw = bounded.split("\n");
  for (let index = 0; index < raw.length; index++) {
    const line = raw[index];
    if (index === raw.length - 1 && line === "") break;
    if (lines.length >= MAX_SOURCE_DIFF_LINES) { truncated = true; break; }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]); newLine = Number(hunk[2]);
      lines.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+")) {
      lines.push({ kind: "addition", text: line.slice(1), newLine: newLine++ }); added++;
    } else if (line.startsWith("-")) {
      lines.push({ kind: "deletion", text: line.slice(1), oldLine: oldLine++ }); removed++;
    } else if (line.startsWith(" ")) {
      lines.push({ kind: "context", text: line.slice(1), oldLine: oldLine++, newLine: newLine++ });
    } else if (line) {
      lines.push({ kind: "note", text: line });
    }
  }
  const partial = truncated || (additions !== undefined && added !== additions) || (deletions !== undefined && removed !== deletions);
  return { lines, partial, truncated };
}
