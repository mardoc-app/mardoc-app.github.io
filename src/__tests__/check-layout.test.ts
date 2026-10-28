// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";

const script = path.resolve(__dirname, "../../scripts/check-layout.mjs");
const repoRoot = path.resolve(__dirname, "../..");
const tmps: string[] = [];

function run(root: string) {
  const r = spawnSync(process.execPath, [script, root], { encoding: "utf8" });
  return { code: r.status, out: r.stdout };
}

function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "layout-"));
  tmps.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("layout check", () => {
  it("t30_layout_check_flags_violations (LR-10, LR-11)", () => {
    const a = run(fixture({ "src/lib/auth/session.ts": 'import { useState } from "react";\n' }));
    expect(a.code).toBe(1);
    expect(a.out).toMatch(/^LR-10 src\/lib\/auth\/session\.ts:1 /);

    const b = run(fixture({ "src/lib/auth/session.ts": "const x = 1;\nlocalStorage.getItem('a');\n" }));
    expect(b.code).toBe(1);
    expect(b.out).toMatch(/LR-10 src\/lib\/auth\/session\.ts:2 uses localStorage/);

    const c = run(fixture({ "worker/src/domain/callback.ts": "export const f = () => fetch('x');\n" }));
    expect(c.code).toBe(1);
    expect(c.out).toMatch(/^LR-11 worker\/src\/domain\/callback\.ts:1 uses fetch/);

    const d = run(fixture({ "worker/src/domain/callback.ts": "export const f = (env: Env) => env.X;\n" }));
    expect(d.code).toBe(1);
    expect(d.out).toMatch(/LR-11 .* uses env/);
  });

  it("t30_layout_check_allows_adapters_comments_and_missing_dirs", () => {
    const ok = run(
      fixture({
        "src/lib/auth/sign-in-window.ts": "window.open('x'); import 'react';\n",
        "src/lib/auth/credential.ts": "fetch('x');\n",
        "src/lib/auth/session.ts":
          "// window and document are mentioned here\n/* fetch\n localStorage */\nconst s = 'window';\nexport const k = 1;\n",
        "worker/src/adapters/github.ts": "export const g = () => fetch('x');\n",
        "worker/src/domain/callback.ts": "export const pure = 1; // env, fetch\n",
      }),
    );
    expect(ok.code).toBe(0);
    expect(run(fixture({})).code).toBe(0);
  });

  it("t30_layout_check_real_tree_is_clean", () => {
    const r = run(repoRoot);
    expect(r.out).toBe("layout check: ok\n");
    expect(r.code).toBe(0);
  });
});
