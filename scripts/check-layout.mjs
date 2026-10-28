#!/usr/bin/env node
// Layout checker for the GitHub sign-in design (T-30).
//   LR-10: src/lib/auth/** (except the adapters sign-in-window.ts and
//          credential.ts) imports no react/react-dom and uses none of
//          window, document, localStorage, sessionStorage, fetch.
//   LR-11: worker/src/domain/** uses no fetch and no env.
// Usage: node scripts/check-layout.mjs [rootDir]
// Prints "LR-n file:line message" per violation; exits 1 on any, else 0.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const LR10_ADAPTERS = new Set(["sign-in-window.ts", "credential.ts"]);
const LR10_IDENTS = ["window", "document", "localStorage", "sessionStorage", "fetch"];
const LR11_IDENTS = ["fetch", "env"];

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
function blankStrings(line) {
  return line.replace(/(["'])(?:\\.|(?!\1).)*\1/g, (m) => m[0] + m[0]);
}

const violations = [];

function checkFile(file, rule, idents, checkReact) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    if (checkReact) {
      const imp =
        /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'])(react|react-dom)(?:\/[^"']*)?\1/.exec(raw);
      if (imp) violations.push(`${rule} ${rel}:${lineNo} imports ${imp[2]}`);
    }
    const code = blankStrings(raw);
    for (const id of idents) {
      if (new RegExp(`(?<![.\\w$])${id}(?![\\w$])`).test(code)) {
        violations.push(`${rule} ${rel}:${lineNo} uses ${id}`);
      }
    }
  });
}

for (const f of walk(path.join(root, "src/lib/auth"))) {
  if (LR10_ADAPTERS.has(path.basename(f))) continue;
  checkFile(f, "LR-10", LR10_IDENTS, true);
}
for (const f of walk(path.join(root, "worker/src/domain"))) {
  checkFile(f, "LR-11", LR11_IDENTS, false);
}

if (violations.length) {
  console.log(violations.join("\n"));
  process.exit(1);
}
console.log("layout check: ok");
