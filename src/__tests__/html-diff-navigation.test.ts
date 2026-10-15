import { afterEach, expect, it, vi } from "vitest";
import { clearHtmlDiffNavigation, navigateHtmlDiff } from "@/lib/html-diff-navigation";

afterEach(() => { document.body.innerHTML = ""; document.head.innerHTML = ""; });
const changes = [{ id: "one" }, { id: "two" }, { id: "three" }];

it("wraps in both directions, focuses targets and clears previous active state", () => {
  document.body.innerHTML = '<p data-mardoc-change-id="one">First</p><p data-mardoc-change-id="two">Second</p><p data-mardoc-change-id="three" tabindex="0">Third</p>';
  const first = document.querySelector('p')!;
  first.scrollIntoView = vi.fn();
  expect(navigateHtmlDiff(document, changes, -1, "next")).toBe(0);
  expect(document.activeElement).toBe(first);
  expect(first.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  expect(navigateHtmlDiff(document, changes, 0, "previous")).toBe(2);
  expect(first.hasAttribute("data-mardoc-active-change")).toBe(false);
  expect(first.hasAttribute("tabindex")).toBe(false);
  expect(navigateHtmlDiff(document, changes, 2, "next")).toBe(0);
  clearHtmlDiffNavigation(document);
  expect(document.querySelector('[data-mardoc-active-change]')).toBeNull();
  expect(document.querySelectorAll('p')[2].getAttribute("tabindex")).toBe("0");
  expect(document.querySelectorAll('#mardoc-html-diff-navigation-style')).toHaveLength(1);
});

it("opens nested details and skips missing and hidden markers", () => {
  document.body.innerHTML = '<p hidden data-mardoc-change-id="one">Hidden</p><div style="display:none"><p data-mardoc-change-id="two">Hidden ancestor</p></div><details><summary>Outer</summary><details><summary>Inner</summary><p data-mardoc-change-id="three">Visible after expanding</p></details></details>';
  expect(navigateHtmlDiff(document, changes, -1, "next")).toBe(2);
  expect(Array.from(document.querySelectorAll("details")).every(element => element.open)).toBe(true);
  expect(navigateHtmlDiff(document, [{ id: "missing" }], -1, "next")).toBe(-1);
  expect(document.querySelector('[data-mardoc-active-change]')).toBeNull();
});

it("matches punctuation in IDs without CSS interpolation and finds visible duplicate markers", () => {
  const id = 'a"] #bad';
  const hidden = document.createElement("span");
  hidden.hidden = true;
  hidden.setAttribute("data-mardoc-change-id", id);
  const visible = document.createElement("span");
  visible.setAttribute("data-mardoc-change-id", id);
  document.body.append(hidden, visible);
  expect(navigateHtmlDiff(document, [{ id }], -1, "previous")).toBe(0);
  expect(document.activeElement).toBe(visible);
  expect(navigateHtmlDiff(document, [], 0, "next")).toBe(-1);
  expect(visible.hasAttribute("data-mardoc-active-change")).toBe(false);
});
