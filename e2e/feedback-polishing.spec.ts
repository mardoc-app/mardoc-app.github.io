import { test, expect } from "@playwright/test";
import { openPullRequest } from "./fixtures/helpers";

test("polishes a review draft with explicit preview and acceptance, without submitting the review", async ({ page }) => {
  const requests: unknown[] = [];
  await page.route("https://ai.example/v1/chat/completions", async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      choices: [{ message: { content: "Could you explain how this handles retries?" }, finish_reason: "stop" }],
    }) });
  });
  await openPullRequest(page, /getting started guide/i);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const draft = page.getByPlaceholder("Leave a comment (optional)");
  await draft.fill("what about retries?");
  await page.getByRole("button", { name: "Polish feedback", exact: true }).click();
  await page.getByLabel("Chat completions URL").fill("https://ai.example/v1/chat/completions");
  await page.getByLabel("Model", { exact: true }).fill("review-model");
  await page.getByLabel("API key (optional for local endpoints)").fill("fake-key");
  await page.getByRole("button", { name: "Save AI connection", exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Generate rewrite", exact: true }).click();
  await expect(page.getByText("Could you explain how this handles retries?", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("what about retries?");
  expect(requests).toHaveLength(1);
  expect(JSON.parse((requests[0] as any).messages[1].content)).toEqual({ style: "clearer", draft: "what about retries?" });
  await page.getByRole("button", { name: "Use rewrite", exact: true }).click();
  await expect(draft).toHaveValue("Could you explain how this handles retries?");
  await expect(page.getByRole("button", { name: "Submit review", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mardoc_feedback_ai"))).not.toContain("fake-key");
});
