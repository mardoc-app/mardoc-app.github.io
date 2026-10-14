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
  expect(screen.getByRole("status").textContent).toContain("2 changed spots · Change 2 of 2: New section");
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
  expect(screen.getByRole("status").textContent).toBe("0 changed spots");
  expect((screen.getByRole("button", { name: "Previous change" }) as HTMLButtonElement).disabled).toBe(true);
});

it("expands changed pages and supports client navigation while retaining native links", () => {
  const onNavigatePage = vi.fn();
  render(<HtmlDiffToolbar {...props({ changedPages: [{ path: "docs/page.html", href: "#/page" }], onNavigatePage })}/>);
  const toggle = screen.getByRole("button", { name: "All changed pages (1)" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  const link = screen.getByRole("link", { name: "docs/page.html" });
  expect(link.getAttribute("href")).toBe("#/page");
  fireEvent.click(link, { ctrlKey: true });
  expect(onNavigatePage).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(onNavigatePage).toHaveBeenCalledWith("docs/page.html");
  expect(screen.queryByRole("navigation", { name: "All changed HTML pages" })).toBeNull();
});
