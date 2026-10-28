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

  // CR-3: imports are an allow-list, and member access to globals is caught.
  const fails = (files: Record<string, string>, pattern: RegExp) => {
    const r = run(fixture(files));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(pattern);
  };

  it("t30_lr10_session_imports_only_types_and_contract_cr3", () => {
    for (const spec of ["./credential", "../github-api", "./sign-in-window", "@octokit/rest", "node:fs", "./config"]) {
      fails({ "src/lib/auth/session.ts": `import { x } from "${spec}";\n` }, /^LR-10 src\/lib\/auth\/session\.ts:1 imports /m);
    }
    // A multi-line import still names its line.
    fails(
      { "src/lib/auth/session.ts": 'import type { A } from "./types";\nimport {\n  reset,\n} from "../github-api";\n' },
      /^LR-10 src\/lib\/auth\/session\.ts:4 imports \.\.\/github-api$/m,
    );
    // Re-exports, side-effect imports, dynamic imports and require.
    fails({ "src/lib/auth/session.ts": 'export { x } from "./credential";\n' }, /LR-10 .*session\.ts:1 imports \.\/credential/);
    fails({ "src/lib/auth/session.ts": 'import "./credential";\n' }, /LR-10 .*session\.ts:1 imports \.\/credential/);
    fails({ "src/lib/auth/session.ts": 'const m = await import("../github-api");\n' }, /LR-10 .*session\.ts:1 imports \.\.\/github-api/);
    fails({ "src/lib/auth/session.ts": 'const m = require("../github-api");\n' }, /LR-10 .*session\.ts:1 imports \.\.\/github-api/);
    fails({ "src/lib/auth/session.ts": "const m = await import(name);\n" }, /LR-10 .*session\.ts:1 imports a computed module/);
  });

  it("t30_lr10_other_domain_files_import_no_adapter_or_package_cr3", () => {
    fails({ "src/lib/auth/types.ts": 'import { x } from "./credential";\n' }, /^LR-10 src\/lib\/auth\/types\.ts:1 imports \.\/credential$/m);
    fails({ "src/lib/auth/contract.ts": 'import { y } from "../github-api";\n' }, /^LR-10 src\/lib\/auth\/contract\.ts:1 imports \.\.\/github-api$/m);
    fails({ "src/lib/auth/new-rule.ts": 'import { z } from "lodash";\n' }, /^LR-10 src\/lib\/auth\/new-rule\.ts:1 imports lodash$/m);
  });

  it("t30_lr10_member_access_to_globals_is_caught_cr3", () => {
    for (const [code, what] of [
      ["globalThis.fetch('x');", "globalThis"],
      ["self.localStorage.getItem('a');", "self"],
      ["const e = process.env.X;", "process"],
      ["const g = globalThis;", "globalThis"],
    ] as const) {
      fails({ "src/lib/auth/session.ts": `${code}\n` }, new RegExp(`^LR-10 src/lib/auth/session\\.ts:1 uses ${what}$`, "m"));
    }
  });

  it("t30_lr11_worker_domain_imports_only_siblings_and_contract_cr3", () => {
    fails({ "worker/src/domain/callback.ts": 'import { createGitHub } from "../adapters/github";\n' }, /^LR-11 worker\/src\/domain\/callback\.ts:1 imports \.\.\/adapters\/github$/m);
    fails({ "worker/src/domain/callback.ts": 'import type { Env } from "../index";\n' }, /^LR-11 .* imports \.\.\/index$/m);
    fails({ "worker/src/domain/page.ts": 'import { x } from "../../../src/lib/auth/session";\n' }, /^LR-11 .* imports \.\.\/\.\.\/\.\.\/src\/lib\/auth\/session$/m);
    fails({ "worker/src/domain/page.ts": 'import { x } from "node:crypto";\n' }, /^LR-11 .* imports node:crypto$/m);
  });

  it("t30_lr11_member_access_to_globals_is_caught_cr3", () => {
    for (const [code, what] of [
      ["globalThis.fetch(TOKEN_URL);", "globalThis"],
      ["self.fetch(TOKEN_URL);", "self"],
      ["const s = process.env.CLIENT_SECRET;", "process"],
      ["const s = deps.env.CLIENT_SECRET;", "env"],
    ] as const) {
      fails({ "worker/src/domain/callback.ts": `${code}\n` }, new RegExp(`^LR-11 worker/src/domain/callback\\.ts:1 uses ${what}$`, "m"));
    }
  });

  it("t30_allowed_imports_pass_cr3", () => {
    const ok = run(
      fixture({
        "src/lib/auth/session.ts": 'import type {\n  A,\n} from "./types";\nimport { B } from "./contract";\n',
        "src/lib/auth/types.ts": 'import type { C } from "./contract";\n',
        "src/lib/auth/contract.ts": "export const k = 1;\n",
        "src/lib/auth/config.ts": "export const s = process.env.NEXT_PUBLIC_X;\n",
        "worker/src/domain/login.ts": 'import { N } from "../../../src/lib/auth/contract";\nexport const r = () => crypto.getRandomValues(new Uint8Array(1));\n',
        "worker/src/domain/cookies.ts": 'import { R } from "./login";\n',
        "worker/src/domain/page.ts": 'import type { S } from "../../../src/lib/auth/contract";\n',
      }),
    );
    expect(ok.out).toBe("layout check: ok\n");
    expect(ok.code).toBe(0);
  });

  it("t30_layout_check_real_tree_is_clean", () => {
    const r = run(repoRoot);
    expect(r.out).toBe("layout check: ok\n");
    expect(r.code).toBe(0);
  });
});
