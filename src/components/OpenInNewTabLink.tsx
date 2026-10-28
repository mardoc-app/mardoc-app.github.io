"use client";

// Shown instead of Sign in with GitHub when MarDoc runs inside a frame on
// another page (F-19, SR-1). Sign-in works only in a top-level tab, so this
// opens the current address in one. `noopener` keeps the new tab from
// reaching back to the framing page.
import React from "react";
import { ExternalLink } from "lucide-react";

export const OPEN_IN_NEW_TAB_TEXT = "Open MarDoc in a new tab";
export const FRAMED_HINT = "Sign-in with GitHub works only when MarDoc is not inside another page.";

export default function OpenInNewTabLink({ className }: { className?: string }) {
  const href = typeof window === "undefined" ? "/" : window.location.href;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <ExternalLink size={14} aria-hidden="true" />
      {OPEN_IN_NEW_TAB_TEXT}
    </a>
  );
}
