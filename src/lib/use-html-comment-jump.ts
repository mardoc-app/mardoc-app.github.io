import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { CommentTarget } from "./comment-target";
import { commentLocationMessages } from "./markdown-comment-location";
import { highlightHtmlComment, locateHtmlComment } from "./html-comment-location";

interface JumpComment { id: string; target?: CommentTarget; selectedText?: string }

export function useHtmlCommentJump(iframe: RefObject<HTMLIFrameElement>, source: string, srcdoc: string,
  rendered: boolean, request: {id: string} | null, comments: JumpComment[], report: (message: string) => void) {
  const [loaded, setLoaded] = useState<{doc: Document | null; srcdoc: string} | null>(null);
  const handled = useRef<object | null>(null);
  const cleanup = useRef<(() => void) | undefined>();
  const sourceDocument = useMemo(() => {
    if (typeof document === "undefined") return null;
    // Template contents are inert: validating source must not execute scripts or
    // start another round of image/iframe requests.
    const template = document.createElement("template");
    template.innerHTML = source;
    return template.content;
  }, [source]);
  const onLoad = useCallback(() => {
    cleanup.current?.(); cleanup.current = undefined;
    const doc = iframe.current?.contentDocument;
    setLoaded({doc:doc?.URL === "about:srcdoc" ? doc : null,srcdoc});
  }, [iframe,srcdoc]);
  useEffect(() => () => { cleanup.current?.(); cleanup.current = undefined; }, [srcdoc]);
  useEffect(() => {
    if (!rendered || !request || handled.current === request || !sourceDocument || !loaded || loaded.srcdoc !== srcdoc) return;
    const frame = requestAnimationFrame(() => {
      if (!loaded.doc) {
        handled.current = request;
        report("The iframe is no longer showing the reviewed HTML document. Reopen the file before jumping.");
        return;
      }
      if (iframe.current?.contentDocument !== loaded.doc) return;
      const comment = comments.find(item => item.id === request.id);
      if (!comment) return;
      handled.current = request;
      cleanup.current?.(); cleanup.current = undefined;
      const location = locateHtmlComment(loaded.doc, sourceDocument, comment.target, comment.selectedText || "");
      if (location.status !== "found" && location.status !== "range") {
        report(commentLocationMessages[location.status]); return;
      }
      const highlight = highlightHtmlComment(loaded.doc, location, () => report("The highlighted passage changed. Jump again to locate the current text."));
      cleanup.current = highlight.clear;
      report(highlight.status === "hidden" ? "The commented passage is hidden. Reveal its slide or section, then jump again."
        : location.status === "range" ? "Source element highlighted. No exact selection quote is available."
        : highlight.status === "element" ? "Comment located. This browser highlights its containing elements."
        : "Comment location highlighted.");
    });
    return () => cancelAnimationFrame(frame);
  }, [iframe, rendered, request, comments, loaded, srcdoc, sourceDocument, report]);
  return onLoad;
}
