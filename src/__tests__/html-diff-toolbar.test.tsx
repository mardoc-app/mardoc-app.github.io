import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HtmlDiffToolbar, { type HtmlDiffToolbarProps } from "@/components/HtmlDiffToolbar";

afterEach(cleanup);
const changes: HtmlDiffToolbarProps['changes'] = [
  { id: "first", kind: "modified", summary: "Updated heading" },
  { id: "second", kind: "added", summary: "New section" },
];
function props(overrides: Partial<HtmlDiffToolbarProps> = {}): HtmlDiffToolbarProps {
  return { mode: "diff", onModeChange: vi.fn(), changes, activeChange: 1, onNavigate: vi.fn(), ...overrides };
}

it("exposes selected preview and announces active change with wrap navigation callbacks", () => {
  const callbacks = props();
  render(<HtmlDiffToolbar {...callbacks}/>);
  expect(screen.getByRole("button", { name: "Inline Diff" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("2 of 2");
  expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Change 2 of 2");
  expect(screen.queryByText("New section")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous change" }));
  fireEvent.click(screen.getByRole("button", { name: "Next change" }));
  expect(callbacks.onNavigate).toHaveBeenNthCalledWith(1, "previous");
  expect(callbacks.onNavigate).toHaveBeenNthCalledWith(2, "next");
  fireEvent.click(screen.getByRole("button", { name: "Head (new)" }));
  fireEvent.click(screen.getByRole("button", { name: "Base (old)" }));
  expect(callbacks.onModeChange).toHaveBeenNthCalledWith(1, "head");
  expect(callbacks.onModeChange).toHaveBeenNthCalledWith(2, "base");
});

it("disables change navigation for clean previews and empty diffs", () => {
  const { rerender } = render(<HtmlDiffToolbar {...props({ mode: "head" })}/>);
  expect((screen.getByRole("button", { name: "Next change" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("group", { name: "Change legend" })).toBeNull();
  rerender(<HtmlDiffToolbar {...props({ changes: [], activeChange: -1 })}/>);
  expect(screen.getByRole("status").textContent).toBe("0 changes");
  expect((screen.getByRole("button", { name: "Previous change" }) as HTMLButtonElement).disabled).toBe(true);
});
