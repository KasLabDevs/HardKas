import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// SIMULATOR-DURABLE-EXECUTION-1 / SIMULATOR-RECOVERY-FIRST-1 through the built CLI, with real crashes: the command is
// killed (SIGKILL, no cleanup) right before one exact rename by test/fixtures/crash-before-rename.cjs.
// Measured before the fix (2026-10-04, cut27 matrix-1 C2–C5): once the ledger had moved, `tx send <signed>` failed forever
// with "invalid simulated input", and a retried `tx send --from --to --amount` paid again while the first payment had no
// receipt.

const CRASH_PRELOAD = path.join(__dirname, "fixtures", "crash-before-rename.cjs").replace(/\\/g, "/");

describe("SIMULATOR-DURABLE-EXECUTION-1 · real crashes of the CLI", () => {
  let ws: string;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-durable-cli-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const cli = (args: string[], crashBeforeRename?: string) => {
    const env = childEnv(
      crashBeforeRename
        ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${CRASH_PRELOAD}`.trim(), HK_TEST_CRASH_BEFORE_RENAME: crashBeforeRename }
        : {}
    );
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env, encoding: "utf8", timeout: 120_000 });
    let json: any = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {}
    return { status: r.status, signal: r.signal, stdout: r.stdout, stderr: r.stderr, json };
  };
  const ledger = () => JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf-8"));
  const unspent = (name: string): bigint => {
    const state = ledger();
    const address = state.accounts.find((a: any) => a.name === name).address;
    return state.utxos.filter((u: any) => u.address === address && !u.spent).reduce((s: bigint, u: any) => s + BigInt(u.amountSompi), 0n);
  };
  const receiptsTo = (name: string) => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((n) => n.endsWith(".json") && !n.startsWith(".tmp.")).map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf-8"))).filter((r) => r.to?.address === `kaspa:sim_${name}`)
      : [];
  };
  const sign = (from: string, to: string, amount: string, name: string) => {
    expect(cli(["tx", "plan", from, to, "--amount", amount, "--network", "simulated", "--out", `${name}.plan.json`, "--json"]).status).toBe(0);
    expect(cli(["tx", "sign", `${name}.plan.json`, "--out", `${name}.signed.json`, "--json"]).status).toBe(0);
    return JSON.parse(fs.readFileSync(path.join(ws, `${name}.signed.json`), "utf-8"));
  };
  const SOMPI = 100_000_000n;

  it("tx send <signed> killed after the ledger moved: the same command again returns its receipt and pays once", async () => {
    const signed = sign("alice", "dave", "3", "t1");
    const dave0 = unspent("dave");
    const crashed = cli(["tx", "send", "t1.signed.json", "--json"], "receipts[\\\\/]txReceipt-");
    expect(crashed.status, "killed").not.toBe(0);
    expect(unspent("dave") - dave0, "the ledger had already moved").toBe(3n * SOMPI);

    const retry = cli(["tx", "send", "t1.signed.json", "--json"]);
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    expect(retry.json?.data?.receipt?.txId).toBe(signed.txId);
    expect(unspent("dave") - dave0, "paid once").toBe(3n * SOMPI);
    expect(fs.existsSync(path.join(ws, ".hardkas", "artifacts", `${signed.txId}.trace.json`))).toBe(true);
    expect(ledger().pendingExecution).toBeUndefined();
  });

  it("tx send --from --to --amount killed after the ledger moved, then run again: every payment has its receipt", async () => {
    const bob0 = unspent("bob");
    const receipts0 = receiptsTo("bob").length;
    const send = ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"];
    expect(cli(send, "receipts[\\\\/]txReceipt-").status, "killed").not.toBe(0);
    expect(cli(send).status).toBe(0);
    expect((unspent("bob") - bob0) / SOMPI, "two payments (each shortcut is a new intent)").toBe(2n);
    expect(receiptsTo("bob").length - receipts0, "each with its receipt").toBe(2);
  });

  it("a recovery killed while publishing is finished by the next command, still without paying twice", async () => {
    const signed = sign("alice", "dave", "3", "t2");
    const dave0 = unspent("dave");
    expect(cli(["tx", "send", "t2.signed.json", "--json"], "misc[\\\\/]snapshot-").status, "killed after the commit").not.toBe(0);
    expect(ledger().pendingExecution?.txId).toBe(signed.txId);
    // the next command recovers first; it is killed in the middle of that recovery
    expect(cli(["tx", "send", "t2.signed.json", "--json"], "receipts[\\\\/]txReceipt-").status, "killed during recovery").not.toBe(0);
    expect(ledger().pendingExecution?.txId, "still pending").toBe(signed.txId);
    const retry = cli(["tx", "send", "t2.signed.json", "--json"]);
    expect(retry.status, retry.stdout + retry.stderr).toBe(0);
    expect(retry.json?.data?.receipt?.txId).toBe(signed.txId);
    expect(unspent("dave") - dave0).toBe(3n * SOMPI);
    expect(ledger().pendingExecution).toBeUndefined();
  });

  it("dag simulate-reorg after a killed execution settles that execution first, then reorganizes", async () => {
    const signed = sign("alice", "dave", "3", "t4");
    expect(cli(["tx", "send", "t4.signed.json", "--json"], "misc[\\\\/]snapshot-").status, "killed after the commit").not.toBe(0);
    const reorg = cli(["dag", "simulate-reorg", "--depth", "0"]);
    expect(reorg.status, reorg.stdout + reorg.stderr).toBe(0);
    expect(receiptsTo("dave").some((r) => r.txId === signed.txId), "the killed execution's receipt").toBe(true);
    expect(ledger().pendingExecution).toBeUndefined();
    expect(ledger().dag, "the reorg was written").toBeDefined();
  });

  it("simulator fund after a killed execution settles that execution first, then funds", async () => {
    const signed = sign("alice", "dave", "3", "t3");
    expect(cli(["tx", "send", "t3.signed.json", "--json"], "misc[\\\\/]snapshot-").status, "killed after the commit").not.toBe(0);
    const erin0 = unspent("erin");
    const fund = cli(["simulator", "fund", "erin", "--amount", "2"]);
    expect(fund.status, fund.stdout + fund.stderr).toBe(0);
    expect(receiptsTo("dave").some((r) => r.txId === signed.txId), "the killed execution's receipt").toBe(true);
    expect(ledger().pendingExecution).toBeUndefined();
    expect(unspent("erin") - erin0).toBe(2n * SOMPI);
  });
});
