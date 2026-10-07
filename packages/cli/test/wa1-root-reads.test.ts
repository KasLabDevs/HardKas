import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { createEmptyRealAccountStore, saveRealAccountStore } from "@hardkas/accounts";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// WORKSPACE-AUTHORITY-1 (WA-I0) · found by review of the implementation: a command that takes its workspace from the
// invocation root must make EVERY authority read there. `accounts balance <name>` still resolved a real-account name in
// the current directory's `.hardkas/accounts.real.json`, so from a project's subdirectory, or with --workspace, a name
// the project knows was not found. `tx send --track` still records its deployment under the current directory
// (deployments are outside this wave), so with an explicit --workspace it refuses instead of splitting one send.

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const json = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
const filesUnder = (dir: string): string[] =>
  fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true, withFileTypes: false }) as string[]).sort() : [];

describe("WORKSPACE-AUTHORITY-1 · one root for every read of a command", () => {
  let parent: string;
  let proj: string;
  let src: string;
  let elsewhere: string;

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa1-reads-"));
    proj = path.join(parent, "proj");
    fs.mkdirSync(proj);
    fs.writeFileSync(path.join(proj, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: proj, autoBootstrap: true, network: "simulated" });
    src = path.join(proj, "src");
    fs.mkdirSync(src);
    elsewhere = path.join(parent, "elsewhere");
    fs.mkdirSync(elsewhere);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("accounts balance resolves a real-account name in the project's store: from the root, a subdirectory and --workspace", async () => {
    const alice = json(cli(["accounts", "balance", "alice", "--network", "simulated", "--json"], proj).stdout)?.result;
    expect(alice?.address, "precondition: alice has a simulated balance").toMatch(/^kaspasim:/);
    const store = createEmptyRealAccountStore();
    await saveRealAccountStore({ ...store, accounts: [{ name: "carol", address: alice.address }] } as typeof store, { cwd: proj });

    for (const [cwd, extra] of [
      [proj, []],
      [src, []],
      [elsewhere, ["--workspace", proj]]
    ] as const) {
      const r = cli(["accounts", "balance", "carol", "--network", "simulated", "--json", ...extra], cwd);
      const result = json(r.stdout)?.result;
      expect(result?.address, `from ${path.relative(parent, cwd)}: ${r.all.slice(0, 300)}`).toBe(alice.address);
      expect(result?.balanceSompi).toBe(alice.balanceSompi);
    }
    expect(fs.existsSync(path.join(src, ".hardkas")), "nothing under the subdirectory").toBe(false);
    expect(filesUnder(elsewhere)).toEqual([]);
  });

  it("tx send --track refuses an explicit --workspace before reading, broadcasting or writing anything", () => {
    const before = filesUnder(proj);
    const r = cli(["tx", "send", "missing-signed.json", "--track", "lbl", "--workspace", proj, "--json"], elsewhere);
    expect(r.status, r.all).toBe(2);
    expect(json(r.stdout)?.code).toBe("WORKSPACE_OPTION_UNSUPPORTED");
    expect(filesUnder(proj)).toEqual(before);
    expect(filesUnder(elsewhere)).toEqual([]);
  });
});
