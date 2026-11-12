#!/usr/bin/env node
// Layout checker for the GitHub sign-in design (T-30).
//   LR-10: src/lib/auth/** except the adapters (src/lib/auth/sign-in-window.ts,
//          credential.ts, exempt by exact path) and build-time config
//          (config.ts, which reads process.env) imports only ./types and
//          ./contract, and uses none of the banned globals below.
//   LR-11: worker/src/domain/** imports only its siblings (./x) and
//          ../../../src/lib/auth/contract, and uses none of the banned globals
//          below nor env (also as a member, `x.env`).
//   LR-12: src/lib/routing/** except the adapter (src/lib/routing/route-adapter.ts,
//          exempt by exact path) imports only its relative siblings (./x) and
//          uses none of the banned globals below. src/lib/tree-expansion.ts
//          imports nothing and uses none either. A listed exact path that is
//          missing is a violation ("LR-12 <path> missing"). A new file under
//          src/lib/routing is domain code by default.
//   LR-26: in src/ outside src/__tests__, only the route adapter
//          (src/lib/routing/route-adapter.ts, exempt by exact path) touches the
//          address bar: location.hash, `location.href =`, location.assign()
//          and location.replace(), the "hashchange" and "popstate" events
//          (also as onhashchange/onpopstate), the history object on a global
//          (`window.history`, `globalThis.history`, `self.history`,
//          `window["history"]`), `{ hash }` or `{ history }` destructured from
//          location or a global, and the bare global (`history.back()`,
//          `history.pushState(..)` and the other History members) in a file
//          that declares no `history` of its own. Comments do not count.
//          Known limits: an alias (`const loc = window.location; loc.hash = ..`)
//          and a template literal spanning lines are not followed, and a
//          multi-line template literal that mentions location.hash is flagged.
// Banned globals (all rules): window, document, localStorage, sessionStorage,
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

// LR-12: routing/** is pure except the adapter; tree-expansion.ts is listed by exact path.
const LR12_EXEMPT = new Set(["src/lib/routing/route-adapter.ts"]);
const LR12_SIBLING = (spec) => /^\.\/[\w-][\w.-]*$/.test(spec) && stripExt(spec) !== "./route-adapter";
const LR12_EXACT = ["src/lib/tree-expansion.ts"];

// LR-26: only the route adapter touches the address bar.
const LR26_ADAPTER = "src/lib/routing/route-adapter.ts";
const LR26_SKIP = "src/__tests__/";
/** Patterns over comment-free code; `strings: true` patterns see string contents too. */
const LR26_PATTERNS = [
  [/(?<![\w$])location\s*\.\s*hash\b/, "location.hash", false],
  [/(?<![\w$])location\s*\.\s*href\s*=(?!=)/, "location.href", false],
  [/(?<![\w$])location\s*\.\s*(?:assign|replace)\s*\(/, "location.assign or location.replace", false],
  [/(["'`])(hashchange|popstate)\1/, "a hashchange or popstate event", true],
  [/\bon(?:hashchange|popstate)\b/, "a hashchange or popstate event", false],
  [/(?<![\w$.])(?:window|globalThis|self)\s*\.\s*history\b/, "history", false],
  [/(?<![\w$.])(?:window|globalThis|self)\s*\[\s*(["'`])history\1\s*\]/, "history", true],
  [/\{[^{}]*\b(?:hash|history)\b[^{}]*\}\s*=\s*(?:(?:window|globalThis|self|document)\s*\.\s*)?(?:location|window|globalThis|self)\s*(?:[;,)]|$)/,
    "destructuring from location or window", false],
];
/** The bare `history` global, checked only in a file that declares no `history` of its own. */
const LR26_BARE_HISTORY = /(?<![\w$.])history\s*\.\s*(?:pushState|replaceState|back|forward|go|state|length|scrollRestoration)\b/;
const LR26_LOCAL_HISTORY = /\b(?:const|let|var)\s+(?:\{[^}]*)?\bhistory\b|[(,]\s*history\s*[:,)=]|\bimport\b[^;]*\bhistory\b/;

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

for (const f of walk(path.join(root, "src/lib/routing"))) {
  if (LR12_EXEMPT.has(path.relative(root, f).split(path.sep).join("/"))) continue;
  checkFile(f, "LR-12", { idents: GLOBALS, allowImport: LR12_SIBLING });
}
for (const rel of LR12_EXACT) {
  const file = path.join(root, rel);
  try {
    statSync(file);
  } catch {
    violations.push(`LR-12 ${rel} missing`);
    continue;
  }
  checkFile(file, "LR-12", { idents: GLOBALS, allowImport: () => false });
}

for (const f of walk(path.join(root, "src"))) {
  const rel = path.relative(root, f).split(path.sep).join("/");
  if (rel === LR26_ADAPTER || rel.startsWith(LR26_SKIP)) continue;
  const lines = stripComments(readFileSync(f, "utf8")).split("\n");
  const localHistory = lines.some((raw) => LR26_LOCAL_HISTORY.test(blankStrings(raw)));
  lines.forEach((raw, idx) => {
    const code = blankStrings(raw);
    const labels = new Set();
    for (const [re, label, strings] of LR26_PATTERNS) if (re.test(strings ? raw : code)) labels.add(label);
    if (!localHistory && LR26_BARE_HISTORY.test(code)) labels.add("history");
    for (const label of labels) violations.push(`LR-26 ${rel}:${idx + 1} uses ${label}`);
  });
}

if (violations.length) {
  console.log(violations.join("\n"));
  process.exit(1);
}
console.log("layout check: ok");
