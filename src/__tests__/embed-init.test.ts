/**
 * F-16 (T-15): the embed `init` message is trusted only in embed mode and
 * only from the page's own parent window.
 */
import { describe, it, expect } from "vitest";
import { isTrustedInit, type InitTrustInput } from "../lib/embed-init";

// Distinct objects standing in for windows; identity is all that matters.
const self = { name: "mardoc" };
const parent = { name: "vscode-webview" };
const sibling = { name: "sibling-iframe" };
const renderedDoc = { name: "rendered-html-iframe" };

function input(overrides: Partial<InitTrustInput> = {}): InitTrustInput {
  return {
    data: { type: "init", token: "t", fileName: "a.md", fileContent: "# A" },
    source: parent,
    parent,
    self,
    search: "?embed=true",
    ...overrides,
  };
}

describe("isTrustedInit (F-16)", () => {
  it("f16_is_trusted_init_accepts_parent_source_in_embed_mode", () => {
    expect(isTrustedInit(input())).toBe(true);
  });

  it("f16_is_trusted_init_accepts_embed_param_among_others", () => {
    expect(isTrustedInit(input({ search: "?theme=dark&embed=true" }))).toBe(true);
  });

  it("f16_is_trusted_init_rejects_without_embed_param", () => {
    expect(isTrustedInit(input({ search: "" }))).toBe(false);
    expect(isTrustedInit(input({ search: "?embed=false" }))).toBe(false);
    expect(isTrustedInit(input({ search: "?embed=1" }))).toBe(false);
    expect(isTrustedInit(input({ search: "?embedded=true" }))).toBe(false);
  });

  it("f16_is_trusted_init_rejects_source_from_another_window", () => {
    expect(isTrustedInit(input({ source: sibling }))).toBe(false);
  });

  it("f16_is_trusted_init_rejects_source_from_rendered_iframe", () => {
    expect(isTrustedInit(input({ source: renderedDoc }))).toBe(false);
  });

  it("f16_is_trusted_init_rejects_source_from_self", () => {
    expect(isTrustedInit(input({ source: self }))).toBe(false);
  });

  it("f16_is_trusted_init_rejects_null_source", () => {
    expect(isTrustedInit(input({ source: null }))).toBe(false);
    expect(isTrustedInit(input({ source: undefined, parent: undefined }))).toBe(false);
  });

  it("f16_is_trusted_init_rejects_top_level_parent_equals_self", () => {
    // A top-level page: window.parent === window, and a self-posted message.
    expect(isTrustedInit(input({ parent: self, source: self }))).toBe(false);
  });

  it("f16_is_trusted_init_rejects_non_object_data", () => {
    for (const data of [null, undefined, "init", 42, true]) {
      expect(isTrustedInit(input({ data }))).toBe(false);
    }
  });

  it("f16_is_trusted_init_rejects_other_message_types", () => {
    for (const type of ["file:content", "ready", "INIT", undefined]) {
      expect(isTrustedInit(input({ data: { type, token: "t" } }))).toBe(false);
    }
  });
});
