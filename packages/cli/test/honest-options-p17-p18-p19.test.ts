// ESCALÓN 2 · P17, P18, P19 · what the CLI says about its own options.
//   P17: `-h` is the help again in `simulator start` and `sandbox` (it was their --host, so `-h` asked for a value and
//        failed); the host's short flag is -H.
//   P18: `init` writes and prints the build's version (HARDKAS_VERSION), not a version literal in its source.
//   P19: an option that changes nothing is said so when given: a warning on stderr (OPTION_NO_EFFECT) and, in a JSON
//        envelope, `noEffectOptions`; the --allow-mainnet* flags say mainnet is blocked. Their help says "no effect".
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { buildHardkasProgram } from "../src/program.js";
import { NO_EFFECT_OPTIONS } from "../src/no-effect-options.js";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

const here = path.dirname(fileURLToPath(import.meta.url));
let dir = "";
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p17-p19-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], cwd = dir) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    env: hermeticChildEnv(path.join(dir, `net-${args.slice(0, 2).join("-")}.log`)),
    encoding: "utf8",
    input: "",
    timeout: 200_000
  });
  const stdout = r.stdout ?? "";
  let doc: any;
  for (const chunk of stdout.split(/\r?\n(?=[{[])/)) {
    try {
      doc = doc ?? JSON.parse(chunk.trim());
    } catch {
      /* not a document */
    }
  }
  return { status: r.status, stdout, stderr: r.stderr ?? "", doc };
}

function command(program: Command, p: string): Command {
  let cur: Command = program;
  for (const name of p.split(" ")) {
    const next = cur.commands.find((c) => c.name() === name);
    if (!next) throw new Error(`command not found: ${p}`);
    cur = next;
  }
  return cur;
}

describe("P17 · -h is the help in `simulator start` and `sandbox`", () => {
  for (const cmd of [["simulator", "start"], ["sandbox"]]) {
    it(`${cmd.join(" ")} -h prints its help and exits 0; the host is -H, --host`, () => {
      const r = run([...cmd, "-h"]);
      expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
      expect(r.stdout).toContain(`Usage: hardkas ${cmd.join(" ")}`);
      expect(r.stdout).toMatch(/-H, --host <host>/);
      expect(r.stdout).toMatch(/-h, --help/);
    });
  }
});

describe("P18 · init's version is HARDKAS_VERSION", () => {
  it("init.ts holds no version literal", () => {
    const source = fs.readFileSync(path.join(here, "..", "src", "commands", "init.ts"), "utf8");
    expect(source).not.toMatch(/\b\d+\.\d+\.\d+-(?:rc|alpha|beta)\.\d+\b/);
  });

  it("the scaffolded hardkas.config.ts and init's report name the build's version", () => {
    const target = path.join(dir, "p18-init");
    fs.mkdirSync(target);
    const r = run(["init", "--skip-toolchain"], target);
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(fs.readFileSync(path.join(target, "hardkas.config.ts"), "utf8")).toContain(`// HardKAS v${HARDKAS_VERSION} Configuration`);
    expect(`${r.stdout}\n${r.stderr}`).toContain(`Created: hardkas.config.ts (${HARDKAS_VERSION})`);
  });
});

describe("P19 · options with no effect are never accepted in silence", () => {
  const program = buildHardkasProgram({ forDocs: true });

  it("every option in the table exists and its help says it has no effect (or is not implemented)", () => {
    for (const [p, flags] of Object.entries(NO_EFFECT_OPTIONS)) {
      for (const flag of Object.keys(flags)) {
        const option = command(program, p).options.find((o) => o.long === flag);
        expect(option, `${p} ${flag}`).toBeDefined();
        expect(option!.description, `${p} ${flag}`).toMatch(/no effect|not implemented yet/i);
      }
    }
  });

  it("the --allow-mainnet flag says it has no effect and that mainnet is blocked", () => {
    for (const [p, flag] of [["accounts consolidate", "--allow-mainnet"]] as const) {
      const option = command(program, p).options.find((o) => o.long === flag)!;
      expect(option.description).toMatch(/^No effect: mainnet is blocked/);
      expect(NO_EFFECT_OPTIONS[p]![flag]).toMatch(/mainnet is blocked/);
    }
  });

  it("tx sign --wait-lock: warned on stderr and listed in the JSON envelope, whatever the outcome", () => {
    const r = run(["tx", "sign", path.join(dir, "no-such-plan.json"), "--wait-lock", "--json"]);
    expect(r.stderr).toMatch(/--wait-lock has no effect \(OPTION_NO_EFFECT\)/);
    expect(r.doc?.noEffectOptions?.map((n: any) => n.option)).toEqual(["--wait-lock"]);
    expect(r.doc.noEffectOptions[0]).toMatchObject({ code: "OPTION_NO_EFFECT" });
  });

  it("tx sign --allow-mainnet-signing was removed (2026-11-11, owner): an unknown option, nothing read or signed", () => {
    expect(command(program, "tx sign").options.find((o) => o.long === "--allow-mainnet-signing")).toBeUndefined();
    expect(NO_EFFECT_OPTIONS["tx sign"]?.["--allow-mainnet-signing"]).toBeUndefined();
    const r = run(["tx", "sign", path.join(dir, "no-such-plan.json"), "--allow-mainnet-signing", "--json"]);
    expect(r.status, `${r.stdout}\n${r.stderr}`).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/unknown option '--allow-mainnet-signing'/);
    expect(`${r.stdout}\n${r.stderr}`).not.toMatch(/OPTION_NO_EFFECT/);
  });

  it("accounts consolidate --allow-mainnet: warned on stderr, mainnet blocked", () => {
    const r = run(["accounts", "consolidate", "alice", "--allow-mainnet", "--json"]);
    expect(r.stderr).toMatch(/--allow-mainnet has no effect \(OPTION_NO_EFFECT\): mainnet is blocked/);
    expect(r.doc?.noEffectOptions?.map((n: any) => n.option)).toEqual(["--allow-mainnet"]);
  });

  it("init --template --accounts: both warned and listed in init's JSON envelope; the init itself still runs", () => {
    const target = path.join(dir, "p19-init");
    fs.mkdirSync(target);
    const r = run(["init", "--template", "x", "--accounts", "3", "--skip-toolchain", "--json"], target);
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stderr).toMatch(/--template has no effect/);
    expect(r.stderr).toMatch(/--accounts has no effect/);
    expect(r.doc).toMatchObject({ ok: true, command: "init" });
    expect(r.doc.noEffectOptions.map((n: any) => n.option)).toEqual(["--template", "--accounts"]);
  });

  it("an option left at its default is never warned about", () => {
    const target = path.join(dir, "p19-init-plain");
    fs.mkdirSync(target);
    const r = run(["init", "--skip-toolchain", "--json"], target);
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(r.stderr).not.toMatch(/OPTION_NO_EFFECT/);
    expect(r.doc).not.toHaveProperty("noEffectOptions");
  });

  it("dag simulate-reorg --depth that is not a whole number: usage error, nothing changed", () => {
    const fresh = path.join(dir, "p19-dag");
    fs.mkdirSync(fresh);
    const r = run(["dag", "simulate-reorg", "--depth", "abc"], fresh);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/DAG_DEPTH_INVALID/);
    expect(fs.existsSync(path.join(fresh, ".hardkas"))).toBe(false);
  });
});
