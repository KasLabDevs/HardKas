import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// VERIFY-EXIT-CRASH (R0) · BEFORE. MINI-REAUDIT-1 found `hardkas verify` printing a complete `ok:true` result and then
// dying at exit with a native assertion (Windows libuv `!(handle->flags & UV_HANDLE_CLOSING)`, exit 0xC0000409) in a
// workspace that holds a replay report (12/12). The contract: a command's process ends with the exit code its result
// reports. The workspace is built the way a user builds it: plan → sign → send → `replay verify`.

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 180_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
const firstDoc = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
const outcome = (r: ReturnType<typeof cli>) => ({
  ok: firstDoc(r.stdout)?.ok,
  exit: r.status,
  nativeAssertion: /Assertion failed/.test(r.stderr)
});

describe("VERIFY-EXIT-CRASH · a verification that reports success exits 0", () => {
  let parent: string;
  let withReplay: string;
  let withoutReplay: string;

  const workspace = async (name: string, replay: boolean) => {
    const dir = path.join(parent, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    for (const args of [
      ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "p-plan.json", "--json"],
      ["tx", "sign", "p-plan.json", "--out", "p-signed.json", "--json"],
      ["tx", "send", "p-signed.json", "--network", "simulated", "--json"]
    ]) {
      const r = cli(args, dir);
      expect(r.status, `${args.join(" ")}\n${r.stdout}${r.stderr}`).toBe(0);
    }
    if (replay) {
      const receipt = fs.readdirSync(path.join(dir, ".hardkas", "artifacts", "receipts"))[0]!;
      const r = cli(["replay", "verify", `.hardkas/artifacts/receipts/${receipt}`, "--json"], dir);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(fs.readdirSync(path.join(dir, ".hardkas", "artifacts")).some((f) => f.endsWith(".replay.json"))).toBe(true);
    }
    return dir;
  };

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r0-verify-exit-"));
    withReplay = await workspace("with-replay", true);
    withoutReplay = await workspace("without-replay", false);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("`verify --json` after `replay verify`: ok:true and exit 0, three runs out of three", () => {
    const runs = [0, 1, 2].map(() => outcome(cli(["verify", "--json"], withReplay)));
    expect(runs).toEqual([0, 1, 2].map(() => ({ ok: true, exit: 0, nativeAssertion: false })));
  });

  it("the same store-wide verification through `artifact verify .hardkas/artifacts --recursive --strict --json` exits 0", () => {
    const r = cli(["artifact", "verify", ".hardkas/artifacts", "--recursive", "--strict", "--json"], withReplay);
    expect(outcome(r), r.stderr).toEqual({ ok: true, exit: 0, nativeAssertion: false });
  });

  it("`verify` in human mode after `replay verify` exits 0", () => {
    const r = cli(["verify"], withReplay);
    expect({ exit: r.status, nativeAssertion: /Assertion failed/.test(r.stderr) }, r.stderr).toEqual({ exit: 0, nativeAssertion: false });
  });

  it("control: `verify --json` without a replay report exits 0", () => {
    const r = cli(["verify", "--json"], withoutReplay);
    expect(outcome(r), r.stderr).toEqual({ ok: true, exit: 0, nativeAssertion: false });
  });
});
