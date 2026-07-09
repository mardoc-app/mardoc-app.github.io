/**
 * Reload-from-disk bridge for VS Code embed mode (feature 040).
 *
 * The extension reads a file once at panel-open time and posts it via
 * `init` — after that the document is a snapshot. When the file changes
 * on disk (typically an AI agent iterating on a doc the user is
 * reading), the user presses Ctrl/Cmd+Shift+R and the app asks the
 * extension for fresh bytes.
 *
 * Protocol:
 *   App → Extension:  { type: "file:reload" }
 *   Extension → App:  { type: "file:content", filePath, fileName, fileContent }
 *
 * Pure module — no React. Wired up in app-context.tsx, tested in
 * embed-reload.test.ts.
 */

/** Local files opened via the extension get this path prefix in the app. */
const LOCAL_PATH_PREFIX = "__local__/";

type KeyLike = Pick<
  KeyboardEvent,
  "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "key"
>;

/** True for Ctrl+Shift+R / Cmd+Shift+R (no Alt). */
export function isReloadShortcut(e: KeyLike): boolean {
  return (
    (e.metaKey || e.ctrlKey) &&
    e.shiftKey &&
    !e.altKey &&
    e.key.toLowerCase() === "r"
  );
}

/**
 * Ask the parent (VS Code extension) to re-read the current file.
 * Returns false when not running inside an embedding frame.
 */
export function postReloadRequest(): boolean {
  if (typeof window === "undefined" || window.parent === window) return false;
  window.parent.postMessage({ type: "file:reload" }, "*");
  return true;
}

export interface FileContentMessage {
  type: "file:content";
  filePath?: string;
  fileName?: string;
  fileContent: string;
}

/**
 * Decide whether an incoming `file:content` message applies to the
 * currently-open file. Rejects malformed messages and content for a
 * different file (the panel may have been re-pointed since the request).
 *
 * `currentPath` is the app-side selected file path, which for embed
 * files is `__local__/<workspace-relative-path>`.
 */
export function shouldApplyFileContent(
  msg: unknown,
  currentPath: string | null | undefined
): msg is FileContentMessage {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== "file:content") return false;
  if (typeof m.fileContent !== "string") return false;
  if (!currentPath) return false;

  const incoming = (m.filePath as string) || (m.fileName as string) || "";
  if (!incoming) return false;
  return LOCAL_PATH_PREFIX + incoming === currentPath;
}
