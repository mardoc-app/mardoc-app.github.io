#!/usr/bin/env node
// Layout checker for the GitHub sign-in design (T-30).
//   LR-10: src/lib/auth/** except the adapters (src/lib/auth/sign-in-window.ts,
//          credential.ts, exempt by exact path) and build-time config
//          (config.ts, which reads process.env) imports only ./types and
//          ./contract, and uses none of the banned globals below.
//   LR-11: worker/src/domain/** imports only its siblings (./x) and
//          ../../../src/lib/auth/contract, and uses none of the banned globals
//          below nor env (also as a member, `x.env`).
// Banned globals (both rules): window, document, localStorage, sessionStorage,
// fetch, navigator, XMLHttpRequest, indexedDB, caches, WebSocket,
// BroadcastChannel, setTimeout, setInterval, eval, globalThis, self, process;
// location (as location.x, location[..], location = ..); Date.now, new Date(),
// Math.random; Function(..) and new Function(..). Domain code takes the clock
// and randomness from its caller. The no-DOM type check (tsconfig.domain.json)
// backs this up by compile-time name resolution.
// Imports are an allow-list: any other module, a re-export, a side-effect
// import, require() and a computed dynamic import are violations. The global
// names catch member access too (`globalThis.fetch`, `process.env.X`).
// A new file under either tree is domain code by default.
// Usage: node scripts/check-layout.mjs [rootDir]
// Prints "LR-n file:line message" per violation; exits 1 on any, else 0.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// Adapters and build-time config, by exact path from the repository root (CR-8).
const LR10_EXEMPT = new Set([
  "src/lib/auth/sign-in-window.ts",
  "src/lib/auth/credential.ts",
  "src/lib/auth/config.ts",
]);
// Browser, Workers and Node I/O globals plus escape hatches. Domain code gets
// time, randomness and credentials from its caller.
const GLOBALS = [
  "globalThis", "self", "process", "window", "document", "localStorage", "sessionStorage",
  "fetch", "navigator", "XMLHttpRequest", "indexedDB", "caches", "WebSocket", "BroadcastChannel",
  "setTimeout", "setInterval", "eval",
];
const LR10_IDENTS = GLOBALS;
const LR11_IDENTS = GLOBALS;
/** Forms that are not a bare name: [pattern, label]. Patterns see comment- and string-free code. */
const PATTERNS = [
  // `location.x`, `location[...]`, `location = ...`; not a local `const location` or a field.
  [/(?<![.\w$])(?<!(?:const|let|var)\s+)location\s*(?:\.|\[|=(?!=))/, "location"],
  [/(?<![\w$])Date\s*\.\s*now\b/, "Date.now"],
  [/\bnew\s+Date\s*\(\s*\)/, "new Date()"],
  [/(?<![\w$])Math\s*\.\s*random\b/, "Math.random"],
  [/(?<![.\w$])(?:new\s+)?Function\s*\(/, "Function"],
];
/** Names caught even as a member (`deps.env`), not only as a free identifier. */
const LR11_MEMBERS = ["env"];
const stripExt = (spec) => spec.replace(/\.(ts|tsx|js|mjs|cjs)$/, "");
const LR10_IMPORTS = (spec) => ["./types", "./contract"].includes(stripExt(spec));
const LR11_IMPORTS = (spec) =>
  /^\.\/[\w-][\w.-]*$/.test(spec) || stripExt(spec) === "../../../src/lib/auth/contract";

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // missing directories are not violations
  }
  const out = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SOURCE.test(name)) out.push(full);
  }
  return out;
}

// Blank out comments, keeping newlines so line numbers stay right.
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      out += c;
      i++;
    } else if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// Empty the contents of single-line string literals so words inside them are not code.
// Template literals keep their `${...}` expressions, which are code.
function blankStrings(line) {
  return line
    .replace(/(["'])(?:\\.|(?!\1).)*\1/g, (m) => m[0] + m[0])
    .replace(/`(?:\\.|[^`\\])*`/g, (m) => {
      const exprs = [...m.matchAll(/\$\{([^}]*)\}/g)].map((x) => "${" + x[1] + "}");
      return "`" + exprs.join("") + "`";
    });
}

const violations = [];

// Every module a file names: static and type imports, re-exports, side-effect
// imports, literal dynamic imports and require(). Matched over the whole
// source so a multi-line import is reported on the line of its specifier.
const MODULE_REFS = [
  /\bfrom\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g,
  /\brequire\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g,
];
const COMPUTED_REF = /\b(?:import|require)\s*\(\s*(?!["'\s])/g;

function lineOf(src, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (src[i] === "\n") n++;
  return n;
}

function checkFile(file, rule, { idents, members = [], allowImport }) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const src = stripComments(readFileSync(file, "utf8"));
  const found = [];
  for (const re of MODULE_REFS) {
    for (const m of src.matchAll(re)) {
      if (!allowImport(m[2])) found.push([lineOf(src, m.index + m[0].indexOf(m[1])), `imports ${m[2]}`]);
    }
  }
  for (const m of src.matchAll(COMPUTED_REF)) found.push([lineOf(src, m.index), "imports a computed module"]);
  src.split("\n").forEach((raw, idx) => {
    const code = blankStrings(raw);
    for (const id of idents) {
      if (new RegExp(`(?<![.\\w$])${id}(?![\\w$])`).test(code)) found.push([idx + 1, `uses ${id}`]);
    }
    for (const [re, label] of PATTERNS) if (re.test(code)) found.push([idx + 1, `uses ${label}`]);
    for (const id of members) {
      if (new RegExp(`(?<![\\w$])${id}(?![\\w$])`).test(code)) found.push([idx + 1, `uses ${id}`]);
    }
  });
  found.sort((a, b) => a[0] - b[0]);
  for (const [line, message] of found) violations.push(`${rule} ${rel}:${line} ${message}`);
}

for (const f of walk(path.join(root, "src/lib/auth"))) {
  if (LR10_EXEMPT.has(path.relative(root, f).split(path.sep).join("/"))) continue;
  checkFile(f, "LR-10", { idents: LR10_IDENTS, allowImport: LR10_IMPORTS });
}
for (const f of walk(path.join(root, "worker/src/domain"))) {
  checkFile(f, "LR-11", { idents: LR11_IDENTS, members: LR11_MEMBERS, allowImport: LR11_IMPORTS });
}

if (violations.length) {
  console.log(violations.join("\n"));
  process.exit(1);
}
console.log("layout check: ok");
