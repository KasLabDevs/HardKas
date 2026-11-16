import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// INIT-CONFIG-NO-IMPORT-1 (2026-11-15) · `hardkas init` wrote a hardkas.config.ts that imported `@hardkas/sdk`. A global
// CLI install (or a workspace before `npm install`) has no `@hardkas/sdk` next to the config, so every command failed with
// "Failed to load HardKAS config … Cannot find module '@hardkas/sdk'". The config now imports nothing (as config-scaffold.ts
// already does for `config init` / `dev init`). The check loads the generated file with jiti and NO alias, from a temp
// directory outside the repo with no node_modules: what a global install sees. Simulator only: no node, no network.

const here = path.dirname(fileURLToPath(import.meta.url));
const run = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: { ...childEnv(), NO_COLOR: "1" }, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("INIT-CONFIG-NO-IMPORT-1 · the config hardkas init writes loads with nothing installed", () => {
  let ws: string;
  let config: string;

  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-icni1-"));
    const r = run(["init", ".", "--skip-toolchain"], ws);
    expect(r.status, r.out).toBe(0);
    config = fs.readFileSync(path.join(ws, "hardkas.config.ts"), "utf8");
  });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("ICNI-1 the generated config has no import or require", () => {
    expect(config).not.toMatch(/^\s*import\s/m);
    expect(config).not.toMatch(/\brequire\s*\(/);
    expect(config).toMatch(/^export default \{/m);
  });

  it("ICNI-2 it loads with jiti and no alias, outside the repo and with no node_modules (as under a global CLI)", async () => {
    expect(fs.existsSync(path.join(ws, "node_modules"))).toBe(false);
    const requireFromConfig = createRequire(path.join(here, "..", "..", "config", "package.json"));
    const { createJiti } = requireFromConfig("jiti");
    const mod: any = await createJiti(path.join(ws, "hardkas.config.ts")).import(path.join(ws, "hardkas.config.ts"));
    const cfg = mod.default ?? mod;
    expect(cfg.networks?.simnet?.network).toBe("simnet");
    expect(cfg.execution?.default).toBe("simulator");
  });

  it("ICNI-3 the CLI reads it: `config networks` lists the declared simnet network", () => {
    const r = run(["config", "networks"], ws);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/simnet\s+ws:\/\/127\.0\.0\.1:18210/);
  });
});
