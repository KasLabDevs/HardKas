import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// F3 (PAPERCUTS-1): `tx batch` and `dev tx generate` counted failed items but always exited 0, and the CLI ended every
// successful parse with an unconditional `process.exit(0)` that discarded a nonzero `process.exitCode`. Decided: any
// failed item ⇒ exit 1, with the per-item detail still in the JSON; a CLI run never loses a nonzero exit code.
// Real processes on the built CLI, in a simulated workspace.

const cli = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(env), encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
/** stdout must hold exactly one JSON document. */
const onlyJson = (stdout: string) => JSON.parse(stdout);

describe("F3 · batch commands exit nonzero when an item fails", () => {
  let ws: string;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-f3-batch-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const batch = (payments: unknown) => {
    fs.writeFileSync(path.join(ws, "batch.json"), JSON.stringify(payments));
    return cli(["tx", "batch", "--file", "batch.json", "--network", "simulated", "--json"], ws);
  };

  it("tx batch with one failed payment out of two: exit 1, one JSON document with ok:false and both results", () => {
    const r = batch([{ from: "alice", to: "bob", amount: "1" }, { from: "alice", to: "bob" }]);
    expect(r.status, r.all).toBe(1);
    const out = onlyJson(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.successCount).toBe(1);
    expect(out.failCount).toBe(1);
    expect(out.results).toHaveLength(2);
    expect(out.results[1].ok).toBe(false);
  });

  it("tx batch whose every payment fails: exit 1", () => {
    const r = batch([{ from: "alice" }]);
    expect(r.status, r.all).toBe(1);
    expect(onlyJson(r.stdout)).toMatchObject({ ok: false, successCount: 0, failCount: 1 });
  });

  it("tx batch whose payments all succeed: exit 0, and the JSON says ok:true", () => {
    const r = batch([{ from: "alice", to: "bob", amount: "1" }]);
    expect(r.status, r.all).toBe(0);
    expect(onlyJson(r.stdout)).toMatchObject({ ok: true, successCount: 1, failCount: 0 });
  });

  it("dev tx generate whose transactions fail: exit 1 with the detail in the JSON", () => {
    // alice, the only sender of `dev tx generate`, has nothing left to spend
    const ledgerPath = path.join(ws, ".hardkas", "localnet.json");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"));
    const alice = ledger.accounts.find((a: any) => a.name === "alice").address;
    ledger.utxos = ledger.utxos.map((u: any) => (u.address === alice ? { ...u, spent: true } : u));
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    const r = cli(["dev", "tx", "generate", "--count", "2", "--network", "simulated", "--json"], ws);
    expect(r.status, r.all).toBe(1);
    const out = onlyJson(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.failCount).toBe(2);
    expect(out.results).toHaveLength(2);
  });

  it("dev tx generate keeps the original error instead of a generic 'Dev tx generate failed'", () => {
    const r = cli(["dev", "tx", "generate", "--count", "0", "--json"], ws);
    expect(r.status, r.all).toBe(1);
    const out = onlyJson(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.message).toContain("--count must be a positive number");
  });
});

describe("F3 · the CLI never discards a nonzero process.exitCode", () => {
  it("a command that ends normally exits with the exitCode set during the run", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-f3-exitcode-"));
    try {
      const preload = path.join(dir, "set-exit-code.cjs");
      fs.writeFileSync(preload, "process.exitCode = 7;\n");
      const r = cli(["lock", "list", "--json"], dir, {
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${preload.replace(/\\/g, "/")}`.trim()
      });
      expect(onlyJson(r.stdout).ok, "the command itself succeeded").toBe(true);
      expect(r.status, r.all).toBe(7);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
