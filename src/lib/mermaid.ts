"use client";

import { RequestCache } from "./request-cache";
import { measureOperation } from "./performance";

const LIGHT_THEME_VARS = {
  primaryColor: "#E6F1FB",
  primaryTextColor: "#0C447C",
  primaryBorderColor: "#85B7EB",
  secondaryColor: "#E1F5EE",
  secondaryTextColor: "#085041",
  secondaryBorderColor: "#5DCAA5",
  tertiaryColor: "#FAEEDA",
  tertiaryTextColor: "#633806",
  tertiaryBorderColor: "#FAC775",
  lineColor: "#5F5E5A",
  textColor: "#2C2C2A",
  fontSize: "14px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  noteTextColor: "#2C2C2A",
  noteBkgColor: "#F1EFE8",
  noteBorderColor: "#B4B2A9",
};

const DARK_THEME_VARS = {
  primaryColor: "#363949",
  primaryTextColor: "#bd93f9",
  primaryBorderColor: "#6272a4",
  secondaryColor: "#1e3a2a",
  secondaryTextColor: "#50fa7b",
  secondaryBorderColor: "#50fa7b",
  tertiaryColor: "#3d1a1e",
  tertiaryTextColor: "#ffb86c",
  tertiaryBorderColor: "#ff79c6",
  lineColor: "#6272a4",
  textColor: "#f8f8f2",
  fontSize: "14px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  noteTextColor: "#f8f8f2",
  noteBkgColor: "#44475a",
  noteBorderColor: "#6272a4",
};

function detectDarkMode(): boolean {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
}

function getMermaidConfig(isDark: boolean) {
  return {
    startOnLoad: false,
    theme: "base" as const,
    securityLevel: "loose" as const,
    themeVariables: isDark ? DARK_THEME_VARS : LIGHT_THEME_VARS,
    flowchart: { curve: "basis" as const, padding: 16 },
    sequence: { actorMargin: 60, messageMargin: 40 },
  };
}

let mermaidReady: Promise<typeof import("mermaid")["default"]> | null = null;
let lastDark: boolean | null = null;

function getMermaid() {
  if (!mermaidReady) {
    const isDark = detectDarkMode();
    lastDark = isDark;
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize(getMermaidConfig(isDark));
      return m.default;
    });
  }
  return mermaidReady;
}

// Mermaid has global configuration: serialize initialization with rendering so
// concurrent light/dark requests cannot change the theme of a queued diagram.
let renderQueue: Promise<unknown> = Promise.resolve();
let nextDiagramId = 0;
const editorDiagrams = new RequestCache<{ source: string; svg: string }>(64, 4 * 1024 * 1024);
const renderingBlocks = new WeakSet<HTMLElement>();

export function clearMermaidCache(): void { editorDiagrams.clear(); }

function renderDiagram(source: string, dark: boolean): Promise<string> {
  const result = renderQueue.then(async () => {
    const mermaid = await getMermaid();
    if (lastDark !== dark) {
      mermaid.initialize(getMermaidConfig(dark));
      lastDark = dark;
    }
    const { svg } = await mermaid.render(`mardoc-mermaid-${++nextDiagramId}`, source);
    return svg;
  });
  renderQueue = result.catch(() => {});
  return result;
}

const MERMAID_KEYWORDS = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitgraph|journey|mindmap|timeline|quadrantChart|sankey|block|xychart|C4Context)\b/;

/**
 * Pre-render mermaid code blocks in an HTML string, replacing them with
 * <img> tags containing SVG data URIs. Use this before passing HTML to
 * TipTap, which manages its own DOM and can't have elements replaced post-render.
 */
export function preRenderMermaid(html: string): Promise<string> {
  return measureOperation("mermaid-prepare", () => preRenderMermaidUnmeasured(html));
}

async function preRenderMermaidUnmeasured(html: string): Promise<string> {
  // Quick check — skip the mermaid import if no mermaid blocks
  if (!html.includes("language-mermaid") && !html.includes("class=\"mermaid")) return html;

  const temp = document.createElement("div");
  temp.innerHTML = html;

  const codeBlocks = temp.querySelectorAll<HTMLElement>(
    'code.mermaid, code[class*="language-mermaid"]'
  );
  if (codeBlocks.length === 0) return html;

  const dark = detectDarkMode();

  for (let i = 0; i < codeBlocks.length; i++) {
    const codeEl = codeBlocks[i];
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== "PRE") continue;

    const rawHtml = codeEl.innerHTML.replace(/<br\s*\/?>/gi, "\n");
    const textarea = document.createElement("textarea");
    textarea.innerHTML = rawHtml;
    const source = textarea.value.trim();

    try {
      // Cached SVG is used only inside images, whose IDs are isolated from the
      // document. Inline PR SVGs still get unique IDs and fresh layout.
      const { svg } = await editorDiagrams.load(JSON.stringify([dark, source]), async () => ({
        source, svg: await renderDiagram(source, dark),
      }));
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const blobUrl = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.src = blobUrl;
      img.alt = "Mermaid diagram";
      img.setAttribute("data-mermaid-source", source);
      pre.replaceWith(img);
    } catch (err) {
      console.warn("Mermaid render failed:", err);
    }
  }

  return temp.innerHTML;
}

/**
 * Find all mermaid code blocks in a container and render them as SVG diagrams.
 * Detects mermaid blocks by CSS class (dangerouslySetInnerHTML) or by content
 * keywords (TipTap which strips language classes).
 */
export function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  return measureOperation("mermaid-render", () => renderMermaidBlocksUnmeasured(container));
}

async function renderMermaidBlocksUnmeasured(container: HTMLElement): Promise<void> {
  const allCodeBlocks = container.querySelectorAll<HTMLElement>("pre > code");
  const codeBlocks = Array.from(allCodeBlocks).filter((el) => {
    // Match by class (DiffViewer / dangerouslySetInnerHTML)
    if (el.classList.contains("mermaid") || el.className.includes("language-mermaid")) return true;
    // Match by content keywords (TipTap strips classes)
    const text = el.textContent?.trim() || "";
    return MERMAID_KEYWORDS.test(text);
  });
  if (codeBlocks.length === 0) return;

  const dark = detectDarkMode();

  for (let i = 0; i < codeBlocks.length; i++) {
    const codeEl = codeBlocks[i];
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== "PRE" || renderingBlocks.has(pre)) continue;

    // Decode HTML entities and normalize line breaks (TipTap may use <br>)
    const rawHtml = codeEl.innerHTML.replace(/<br\s*\/?>/gi, "\n");
    const textarea = document.createElement("textarea");
    textarea.innerHTML = rawHtml;
    const source = textarea.value.trim();

    try {
      renderingBlocks.add(pre);
      const svg = await renderDiagram(source, dark);
      if (!container.contains(pre)) continue;
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-diagram";
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch {
      // Leave the code block as-is if mermaid can't parse it
    } finally { renderingBlocks.delete(pre); }
  }
}
