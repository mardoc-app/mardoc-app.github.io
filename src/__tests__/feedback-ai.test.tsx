import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearFeedbackConnection, getFeedbackConnection, saveFeedbackConnection, polishFeedback, validateFeedbackConnection } from "@/lib/feedback-ai";
import FeedbackPolisher from "@/components/FeedbackPolisher";

const connection = { endpoint: "https://ai.example/v1/chat/completions", model: "review-model", apiKey: "test-secret" };
beforeEach(() => { localStorage.clear(); clearFeedbackConnection(); });
afterEach(() => { cleanup(); clearFeedbackConnection(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("remembers only endpoint/model and rejects insecure or credential-bearing URLs", () => {
  saveFeedbackConnection(connection);
  expect(getFeedbackConnection()).toEqual(connection);
  expect(localStorage.getItem("mardoc_feedback_ai")).not.toContain("test-secret");
  for (const endpoint of ["http://remote.example/chat", "https://user:secret@ai.example/chat", "https://ai.example/chat?key=secret", "javascript:alert(1)"]) {
    expect(() => validateFeedbackConnection({ ...connection, endpoint })).toThrow();
  }
  expect(validateFeedbackConnection({ ...connection, endpoint: "http://localhost:8000/v1/chat/completions" }).endpoint).toContain("localhost");
  clearFeedbackConnection();
  localStorage.setItem("mardoc_feedback_ai", '{"endpoint":"broken","model":"x"}');
  expect(getFeedbackConnection().endpoint).toBe("");
  clearFeedbackConnection();
  expect(getFeedbackConnection().apiKey).toBe("");
});

it("sends only a bounded feedback draft using the configured connection", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Could you clarify this?" }, finish_reason: "stop" }] })));
  vi.stubGlobal("fetch", fetcher);
  expect(await polishFeedback("what does this mean?", "constructive", connection)).toBe("Could you clarify this?");
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe(connection.endpoint);
  expect(request).toMatchObject({ credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", headers: { Authorization: "Bearer test-secret" } });
  const body = JSON.parse(request.body);
  expect(body.model).toBe("review-model");
  expect(JSON.parse(body.messages[1].content)).toEqual({ style: "constructive", draft: "what does this mean?" });
  expect(body.store).toBe(false);
  await expect(polishFeedback("x".repeat(10_001), "clearer", connection)).rejects.toThrow("10,000");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("handles HTTP, malformed, incomplete and oversized responses without displaying provider bodies", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(new Response("test-secret", { status: 401 }));
  await expect(polishFeedback("draft", "clearer", connection)).rejects.toThrow("rejected this connection");
  fetcher.mockResolvedValueOnce(new Response("<html>Error</html>"));
  await expect(polishFeedback("draft", "clearer", connection)).rejects.toThrow("chat completions response");
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "unfinished" }, finish_reason: "length" }] })));
  await expect(polishFeedback("draft", "clearer", connection)).rejects.toThrow("incomplete");
  fetcher.mockResolvedValueOnce(new Response("x".repeat(130_000)));
  await expect(polishFeedback("draft", "clearer", connection)).rejects.toThrow("too large");
});

it("aborts a timed-out request and reports that the draft is unchanged", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url, request) => new Promise((_resolve, reject) => {
    request.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })));
  const failure = expect(polishFeedback("draft", "clearer", connection)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(30_000);
  await failure;
});

it("does not generate or replace feedback until explicitly requested", async () => {
  saveFeedbackConnection(connection);
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Polished feedback" } }] })));
  vi.stubGlobal("fetch", fetcher);
  function Harness() {
    const [value, setValue] = useState("Original feedback");
    return <><input aria-label="Draft" value={value} onChange={e => setValue(e.target.value)} /><FeedbackPolisher value={value} onChange={setValue} /></>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Polish feedback" }));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Generate rewrite" }));
  await screen.findByText("Polished feedback");
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("Original feedback");
  fireEvent.click(screen.getByRole("button", { name: "Use rewrite" }));
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("Polished feedback");
  expect(screen.queryByRole("region", { name: "Polish feedback" })).toBeNull();
});

it("discards an in-flight rewrite if the draft changes", async () => {
  saveFeedbackConnection(connection);
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(r => { resolve = r; })));
  const onChange = vi.fn();
  const { rerender } = render(<FeedbackPolisher value="Original" onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Polish feedback" }));
  fireEvent.click(screen.getByRole("button", { name: "Generate rewrite" }));
  rerender(<FeedbackPolisher value="New draft" onChange={onChange} />);
  resolve(new Response(JSON.stringify({ choices: [{ message: { content: "Stale rewrite" } }] })));
  await waitFor(() => expect(screen.queryByText("Stale rewrite")).toBeNull());
  expect(onChange).not.toHaveBeenCalled();
});
