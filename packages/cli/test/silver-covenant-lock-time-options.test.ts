import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

// CLTV · `silver covenant transition` and `silver covenant advance` take `--lock-time-daa | --lock-time-ms` like
// `silver spend` (the SDK's planTransition({ lockTime }) is proven on a node in R3-F's simnet file). The typed lock time
// is checked before any record is read, any key or any node: an invalid one is LOCK_TIME_INVALID, exit 2, and nothing
// is contacted.

let dir: string;
beforeAll(() => {
  assertHermeticPreloadActive();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cov-locktime-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function run(name: string, args: string[]) {
  const log = path.join(dir, `${name}.net.log`);
  const r = spawnSync(process.execPath, [cliDist, ...args, "--json"], { cwd: dir, encoding: "utf8", env: hermeticChildEnv(log), timeout: 120_000 });
  const net = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  return { status: r.status, all: `${r.stdout}\n${r.stderr}`, connects: net.split("\n").filter((l) => /CONNECT/.test(l)) };
}

const missing = () => path.join(dir, "no-such-record.json");

describe("silver covenant transition|advance --lock-time-daa | --lock-time-ms", () => {
  it("both kinds at once: LOCK_TIME_INVALID, exit 2, before any record or node", () => {
    for (const argv of [
      ["silver", "covenant", "transition", missing(), "--policy", "p", "--constructor-args", missing(), "--state-map", "{}", "--next-state", missing()],
      ["silver", "covenant", "advance", missing(), "--covenant", "ab".repeat(32), "--policy", "p"]
    ]) {
      const r = run(argv[2]!, [...argv, "--lock-time-daa", "10", "--lock-time-ms", "600000000000"]);
      expect(r.status, r.all).toBe(2);
      expect(r.all, r.all).toMatch(/LOCK_TIME_INVALID/);
      expect(r.connects, r.all).toEqual([]);
    }
  });

  it("a value that is not a typed lock time (a time given as a DAA score): LOCK_TIME_INVALID, exit 2", () => {
    const r = run("advance-bad", ["silver", "covenant", "advance", missing(), "--covenant", "ab".repeat(32), "--policy", "p", "--lock-time-daa", "600000000000"]);
    expect(r.status, r.all).toBe(2);
    expect(r.all, r.all).toMatch(/LOCK_TIME_INVALID/);
    expect(r.connects, r.all).toEqual([]);
  });

  it("the options are listed in each command's help", () => {
    for (const cmd of ["transition", "advance"]) {
      const r = spawnSync(process.execPath, [cliDist, "silver", "covenant", cmd, "--help"], { cwd: dir, encoding: "utf8", env: hermeticChildEnv(path.join(dir, `${cmd}-help.net.log`)) });
      expect(r.stdout).toMatch(/--lock-time-daa <n>/);
      expect(r.stdout).toMatch(/--lock-time-ms <t>/);
    }
  });
});
