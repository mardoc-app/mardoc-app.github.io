import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isReloadShortcut,
  postReloadRequest,
  shouldApplyFileContent,
} from "../lib/embed-reload";
import { visibleShortcuts, ALL_SHORTCUTS } from "../lib/keyboard-shortcuts";

function key(overrides: Partial<Parameters<typeof isReloadShortcut>[0]> = {}) {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    key: "r",
    ...overrides,
  };
}

describe("isReloadShortcut", () => {
  it("matches Cmd+Shift+R", () => {
    expect(isReloadShortcut(key({ metaKey: true, shiftKey: true }))).toBe(true);
  });

  it("matches Ctrl+Shift+R", () => {
    expect(isReloadShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it("matches uppercase R (shift held changes the key value)", () => {
    expect(
      isReloadShortcut(key({ metaKey: true, shiftKey: true, key: "R" }))
    ).toBe(true);
  });

  it("rejects plain Cmd+R (browser reload)", () => {
    expect(isReloadShortcut(key({ metaKey: true }))).toBe(false);
  });

  it("rejects Shift+R without a modifier", () => {
    expect(isReloadShortcut(key({ shiftKey: true }))).toBe(false);
  });

  it("rejects when Alt is held", () => {
    expect(
      isReloadShortcut(key({ metaKey: true, shiftKey: true, altKey: true }))
    ).toBe(false);
  });

  it("rejects other keys", () => {
    expect(
      isReloadShortcut(key({ metaKey: true, shiftKey: true, key: "p" }))
    ).toBe(false);
  });
});

describe("postReloadRequest", () => {
  const originalParent = window.parent;

  afterEach(() => {
    Object.defineProperty(window, "parent", {
      value: originalParent,
      writable: true,
      configurable: true,
    });
  });

  it("returns false when not embedded (parent === window)", () => {
    expect(postReloadRequest()).toBe(false);
  });

  it("posts file:reload to the parent frame when embedded", () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", {
      value: { postMessage },
      writable: true,
      configurable: true,
    });

    expect(postReloadRequest()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "file:reload" }, "*");
  });
});

describe("shouldApplyFileContent", () => {
  const msg = {
    type: "file:content",
    filePath: "docs/design.md",
    fileName: "design.md",
    fileContent: "# Fresh",
  };

  it("accepts a matching filePath", () => {
    expect(shouldApplyFileContent(msg, "__local__/docs/design.md")).toBe(true);
  });

  it("falls back to fileName when filePath is absent", () => {
    const noPath = { ...msg, filePath: undefined };
    expect(shouldApplyFileContent(noPath, "__local__/design.md")).toBe(true);
  });

  it("rejects a different file", () => {
    expect(shouldApplyFileContent(msg, "__local__/docs/other.md")).toBe(false);
  });

  it("rejects when no file is open", () => {
    expect(shouldApplyFileContent(msg, null)).toBe(false);
    expect(shouldApplyFileContent(msg, undefined)).toBe(false);
  });

  it("rejects the wrong message type", () => {
    expect(
      shouldApplyFileContent(
        { ...msg, type: "init" },
        "__local__/docs/design.md"
      )
    ).toBe(false);
  });

  it("rejects missing or non-string fileContent", () => {
    expect(
      shouldApplyFileContent(
        { type: "file:content", filePath: "docs/design.md" },
        "__local__/docs/design.md"
      )
    ).toBe(false);
    expect(
      shouldApplyFileContent(
        { type: "file:content", filePath: "docs/design.md", fileContent: 42 },
        "__local__/docs/design.md"
      )
    ).toBe(false);
  });

  it("rejects non-object messages", () => {
    expect(shouldApplyFileContent(null, "__local__/a.md")).toBe(false);
    expect(shouldApplyFileContent("file:content", "__local__/a.md")).toBe(false);
  });

  it("rejects a message with neither filePath nor fileName", () => {
    expect(
      shouldApplyFileContent(
        { type: "file:content", fileContent: "x" },
        "__local__/a.md"
      )
    ).toBe(false);
  });
});

describe("visibleShortcuts (embed-only entries)", () => {
  it("hides embed-only shortcuts outside the VS Code embed", () => {
    const visible = visibleShortcuts(ALL_SHORTCUTS, false);
    expect(visible.some((s) => s.embedOnly)).toBe(false);
  });

  it("includes the reload shortcut inside the embed", () => {
    const visible = visibleShortcuts(ALL_SHORTCUTS, true);
    expect(
      visible.some((s) => s.description === "Reload file from disk")
    ).toBe(true);
  });

  it("passes non-embed entries through unchanged", () => {
    const visible = visibleShortcuts(ALL_SHORTCUTS, false);
    const nonEmbed = ALL_SHORTCUTS.filter((s) => !s.embedOnly);
    expect(visible).toEqual(nonEmbed);
  });
});
