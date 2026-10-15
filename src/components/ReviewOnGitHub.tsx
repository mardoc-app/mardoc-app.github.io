"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { githubReviewFileUrl } from "@/lib/github-review-url";
import { useApp } from "@/lib/app-context";
import { openExternal } from "@/lib/open-external";

export default function ReviewOnGitHub({ repo, pr, path }: { repo: string; pr: number; path: string }) {
  const { isEmbedded } = useApp();
  const fallback = `https://github.com/${repo.split("/").map(encodeURIComponent).join("/")}/pull/${pr}/files`;
  const identity = `${repo}/${pr}/${path}`;
  const [target, setTarget] = useState({ identity: "", url: fallback });
  useEffect(() => {
    let current = true;
    void githubReviewFileUrl(repo, pr, path).then(url => {
      if (current) setTarget({ identity, url });
    }).catch(() => { if (current) setTarget({ identity, url: fallback }); });
    return () => { current = false; };
  }, [repo, pr, path, fallback, identity]);
  const href = target.identity === identity ? target.url : fallback;
  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={event => {
    if (isEmbedded && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); openExternal(href, true);
    }
  }} className="inline-flex min-h-11 sm:min-h-8 items-center gap-1 rounded px-2 text-xs text-[var(--accent)] hover:bg-[var(--surface-hover)]">
    Review on GitHub <ExternalLink size={12} />
  </a>;
}
