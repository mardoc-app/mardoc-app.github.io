import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewDock from "@/components/ReviewDock";

afterEach(cleanup);

it("keeps secondary controls collapsed, closes with Escape and restores focus", () => {
  render(<ReviewDock path="docs/page.md" controls={<button>Inline Diff</button>}>
    {() => <p>Secondary details</p>}
  </ReviewDock>);
  const toggle = screen.getByRole("button", { name: "Review tools" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("Secondary details")).toBeNull();
  fireEvent.click(toggle);
  const panel = screen.getByRole("region", { name: "Review tools" });
  expect(document.activeElement).toBe(panel);
  expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByRole("region")).toBeNull();
  expect(document.activeElement).toBe(toggle);
});

it("keeps return navigation available with a clear destination and closes tools on file changes", () => {
  const onReturn = vi.fn();
  const props = { path: "docs/linked.html", returnPath: "docs/origin.html", onReturn, controls: <button>Head (new)</button>,
    children: () => <p>Details</p> };
  const { rerender } = render(<ReviewDock {...props} />);
  const back = screen.getByRole("button", { name: "Back to review" });
  expect(back.getAttribute("title")).toBe("Return to docs/origin.html");
  fireEvent.click(back);
  expect(onReturn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Review tools" }));
  rerender(<ReviewDock {...props} path="docs/another.html" />);
  expect(screen.queryByRole("region")).toBeNull();
});
