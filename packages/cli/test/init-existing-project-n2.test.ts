import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// N-2 (integration 2026-11-06) · `hardkas init` over an existing project refused correctly, but the
// refusal was an untyped Error: `--json` reported `code: "UNKNOWN_ERROR"` and nothing told a script
// that the project was already there. It is now PROJECT_ALREADY_INITIALIZED, exit code 1, and the
// existing hardkas.config.ts is left byte for byte.

describe("N-2 · hardkas init over an existing project", () => {
  const dirs: string[] = [];
  const tmp = (prefix: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  const hardkas = (cwd: string, home: string, args: string[]) => {
    const r = spawnSync(process.execPath, [cliDist, ...args], {
      cwd,
      env: childEnv({ HARDKAS_HOME: home }),
      encoding: "utf8",
      timeout: 120_000
    });
    return { status: r.status, stdout: r.stdout ?? "", out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
  };

  const initialized = () => {
    const home = tmp("hk-n2-home-");
    const ws = tmp("hk-n2-ws-");
    const first = hardkas(ws, home, ["init", ".", "--skip-toolchain"]);
    expect(first.status, first.out).toBe(0);
    const config = path.join(ws, "hardkas.config.ts");
    fs.appendFileSync(config, "\n// owner edit kept by N-2\n"); // hardkas-append-allow: a test edits a scratch config file
    return { home, ws, config, before: fs.readFileSync(config, "utf8") };
  };

  it("--json reports PROJECT_ALREADY_INITIALIZED with exit code 1 and keeps the config", () => {
    const { home, ws, config, before } = initialized();
    const r = hardkas(ws, home, ["init", ".", "--skip-toolchain", "--json"]);

    expect(r.status, r.out).toBe(1);
    const json = JSON.parse(r.stdout);
    expect(json).toMatchObject({ ok: false, code: "PROJECT_ALREADY_INITIALIZED" });
    expect(json.code).not.toBe("UNKNOWN_ERROR");
    expect(json.message).toContain("hardkas.config.ts already exists");
    expect(fs.readFileSync(config, "utf8")).toBe(before);
  });

  it("the human form names the code and the --force way out, with exit code 1", () => {
    const { home, ws, config, before } = initialized();
    const r = hardkas(ws, home, ["init", ".", "--skip-toolchain"]);

    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain("[PROJECT_ALREADY_INITIALIZED]");
    expect(r.out).toContain("--force");
    expect(fs.readFileSync(config, "utf8")).toBe(before);
  });

  it("--force still overwrites hardkas.config.ts", () => {
    const { home, ws, config } = initialized();
    const r = hardkas(ws, home, ["init", ".", "--skip-toolchain", "--force"]);

    expect(r.status, r.out).toBe(0);
    expect(fs.readFileSync(config, "utf8")).not.toContain("owner edit kept by N-2");
  });
});
