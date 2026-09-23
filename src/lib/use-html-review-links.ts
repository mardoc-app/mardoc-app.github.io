import { RefObject, useCallback, useEffect, useRef } from "react";
import { bindHtmlReviewLinks } from "./review-links";

export function useHtmlReviewLinks(iframe: RefObject<HTMLIFrameElement>,
  navigate: (href: string) => void, hrefFor: (href: string) => string | undefined) {
  const handlers = useRef({navigate, hrefFor});
  handlers.current = {navigate, hrefFor};
  const cleanup = useRef<(() => void) | undefined>();
  const onLoad = useCallback(() => {
    cleanup.current?.();
    // srcdoc is same-origin under the existing viewer sandbox. A navigated
    // cross-origin frame must never be accessed or trusted.
    try {
      const doc = iframe.current?.contentDocument;
      if (doc) cleanup.current = bindHtmlReviewLinks(doc,
        href => handlers.current.navigate(href), href => handlers.current.hrefFor(href));
    } catch { /* The iframe may have navigated outside the app. */ }
  }, [iframe]);
  useEffect(() => () => cleanup.current?.(), []);
  return onLoad;
}
