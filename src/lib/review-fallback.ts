import type { PendingInlineComment } from "@/lib/github-api";
import { formatReviewFallback } from "./review-comment-context";

/**
 * Detects known 422 diff-location failures, including diffs GitHub cannot display.
 *
 * GitHub's pulls.createReview is atomic: if any comment's `line` doesn't
 * resolve to a position in the PR diff, the whole review is rejected with a
 * 422 referring to "could not be resolved" or "pull_request_review_thread.line".
 *
 * Extracted as a pure predicate so the fallback logic in
 * submitReviewBatched can be unit-tested without a real Octokit error.
 */
export function isLineResolutionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as Record<string, any>;
  const status = anyErr.status ?? anyErr.response?.status;
  if (status !== 422) return false;
  const errors = anyErr.response?.data?.errors;
  const message = [anyErr.message, anyErr.response?.data?.message,
    ...(Array.isArray(errors) ? errors.map(error => typeof error === "string" ? error : error?.message) : [])]
    .filter(value => typeof value === "string").join(" ").toLowerCase();
  return (
    message.includes("could not be resolved") ||
    message.includes("pull_request_review_thread.line") ||
    /diff (?:entry[\s\S]*? )?(?:is )?too large/.test(message)
  );
}

/**
 * Dependencies that the fallback loop needs to talk to GitHub. Injected so
 * tests can provide mocks without pulling in a real Octokit.
 */
export interface ReviewFallbackDeps {
  postInlineComment: (c: PendingInlineComment) => Promise<void>;
  postIssueComment: (body: string) => Promise<void>;
}

/** Only confirmed writes are removed from the local queue after partial failure. */
export class ReviewFallbackError extends Error {
  constructor(message: string, readonly postedComments: PendingInlineComment[], readonly unresolvedCount: number) {
    super(message);
    this.name = "ReviewFallbackError";
  }
}

/** Fall back only on known diff-location rejection, never on uncertain writes. */
export async function runInlineFallback(
  comments: PendingInlineComment[],
  deps: ReviewFallbackDeps
): Promise<{ unresolvedCount: number; postedComments: PendingInlineComment[] }> {
  let unresolvedCount = 0;
  const postedComments: PendingInlineComment[] = [];
  for (const comment of comments) {
    try {
      try {
        await deps.postInlineComment(comment);
      } catch (error) {
        if (!isLineResolutionError(error)) throw error;
        await deps.postIssueComment(formatReviewFallback(comment));
        unresolvedCount++;
      }
      postedComments.push(comment);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "GitHub rejected the comment";
      throw new ReviewFallbackError(`Could not confirm posting ${comment.path}. Unsent comments remain pending. ${detail}`, postedComments, unresolvedCount);
    }
  }
  return { unresolvedCount, postedComments };
}
