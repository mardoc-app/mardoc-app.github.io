import { afterEach, expect, it, vi } from "vitest";
import { fetchPullRequests, initOctokit, resetGitHubSession } from "@/lib/github-api";

afterEach(() => { resetGitHubSession(); });

const pr = (number: number) => ({
  number, title: `PR ${number}`, user: { login: "a" }, state: "open", merged_at: null,
  created_at: "2026-10-01T00:00:00Z", base: { ref: "main" }, head: { ref: `b${number}` }, body: "",
});

// #140: GitHub returns PRs by last update; the list shows them by number, newest first.
it("issue140_pr_list_is_sorted_by_number_newest_first", async () => {
  const client = initOctokit("fake");
  client.pulls.list = vi.fn().mockResolvedValue({ data: [pr(12), pr(140), pr(7), pr(99)] }) as any;
  const prs = await fetchPullRequests("acme/docs");
  expect(prs.map(p => p.number)).toEqual([140, 99, 12, 7]);
});
