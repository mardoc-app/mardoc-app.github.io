// T-27 (C-13) and F-26: the client secret is read only from env, and
// wrangler.toml declares no storage binding and no secret.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("../src/", import.meta.url);

function sourceFiles(dir: URL): URL[] {
  const out: URL[] = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".ts")) out.push(new URL(name, dir));
    else if (!name.includes(".")) out.push(...sourceFiles(new URL(`${name}/`, dir)));
  }
  return out;
}

describe("secrets and bindings (T-27, T-22)", () => {
  it("t27_secret_read_only_from_env (C-13)", () => {
    // Every line naming the secret is one of: the Env field's type, the read
    // from env, or the form field fed from that read.
    const allowed = [
      /^\s*CLIENT_SECRET: string;$/,
      /^\s*clientSecret: env\.CLIENT_SECRET,$/,
      /^\s*client_secret: config\.clientSecret,$/,
    ];
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/client_secret|CLIENT_SECRET/.test(line)) return;
          if (/^\s*(\/\/|\*|\/\*\*)/.test(line)) return; // comments
          if (!allowed.some((re) => re.test(line))) hits.push(`${file.pathname}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("t27_secret_not_in_wrangler_toml (C-13)", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    const code = toml
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/secret/i);
  });

  it("t22_wrangler_toml_has_no_storage_bindings (F-26)", () => {
    const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
    for (const binding of [
      "kv_namespaces",
      "d1_databases",
      "r2_buckets",
      "queues",
      "durable_objects",
      "services",
      "analytics_engine_datasets",
      "vectorize",
      "hyperdrive",
      "browser",
      "ai",
    ]) {
      expect(toml).not.toMatch(new RegExp(`^\\s*\\[{1,2}\\s*${binding}\\b`, "m"));
      expect(toml).not.toMatch(new RegExp(`^\\s*${binding}\\s*=`, "m"));
    }
    expect(toml).toMatch(/\[observability\]\s*\nenabled = false/);
  });

  it("t22_no_console_in_worker_source (I-16, NF-15)", () => {
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\bconsole\b/.test(line)) hits.push(`${file.pathname}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });
});
