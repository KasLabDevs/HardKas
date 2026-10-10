import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 120_000 });

// EVENT-LEDGER-2 · reviewer's final check (A1 at process level). `tx send --json` whose ledger fails writes EXACTLY ONE
// parseable JSON document on stdout, exits 1, carries EVENT_LEDGER_APPEND_FAILED, the outcome of what the send had done
// and the txId when there is one — never a second envelope from the global error renderer, never "not sent" after an
// effect. Every case runs the built CLI in a simulated workspace while a live process holds the append lock of
// events.jsonl for the whole command, so the first event the command tries to record is the one that fails:
//  1. before anything is sent: the shortcut `tx send --from …` records `workflow.started` first, before any step;
//  2. before the effect, after an artifact write: with a plan and a signed artifact made by `tx plan --out` /
//     `tx sign --out`, the simulator publishes the plan into its canonical store entry before the commit (the CLI's copy
//     is not that entry), and THAT announcement is the first event — the failure says nothing was executed and names
//     the plan copy that was written;
//  3. after a known effect: with the plan and the signed artifact made by the SDK (canonical entries), `tx send
//     <signed.json>` records nothing until the simulator's durable commit has published the receipt, whose
//     announcement is the command's first event — the simulated state has already moved.
// Every workspace is a temporary directory created here; the holder is killed afterwards.

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  ms: number;
}
const cli = (args: string[], cwd: string): Run => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", input: "", timeout: 280_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ms: Date.now() - t0 };
};
/** The ONE JSON document stdout holds: anything else on stdout (a second document, a stray line) fails the parse. */
const theOneJson = (stdout: string): any => {
  const documents = stdout.trim().split(/\r?\n(?=[{[])/).filter((c) => c.trim().length > 0);
  expect(documents.length, `stdout holds ${documents.length} JSON-looking chunks:\n${stdout}`).toBe(1);
  return JSON.parse(stdout.trim());
};
const ledgerLines = (ws: string): string[] => {
  const file = path.join(ws, "events.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
};
const receiptsIn = (ws: string): string[] => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.join(dir, f)).sort() : [];
};
const lockPathOf = (ws: string) => path.join(ws, ".hardkas", "locks", "append-events.jsonl.lock");
const describeRun = (r: Run) => `exit ${r.status} in ${r.ms} ms\nstdout:\n${r.stdout}\nstderr:\n${r.stderr.slice(0, 600)}`;

describe("EVENT-LEDGER-2 final check · `tx send --json` with a ledger failure writes exactly one JSON document", () => {
  let ws: string;
  let sdk: Hardkas;
  let holder: ChildProcess | undefined;

  /** A live process takes the append lock exactly as the coordinator does (wx + its record) and keeps it; returns its record. */
  const holdLedger = async (): Promise<string> => {
    const lock = lockPathOf(ws);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const mineFile = path.join(ws, "holder-lock.txt");
    holder = spawn(
      process.execPath,
      [
        "-e",
        `const fs=require("fs"),os=require("os");const fd=fs.openSync(${JSON.stringify(lock)},"wx");` +
          `const mine=JSON.stringify({schema:"hardkas.lock.v1",name:"append-events.jsonl",pid:process.pid,command:"holder",cwd:process.cwd(),hostname:os.hostname(),createdAt:new Date().toISOString(),expiresAt:null});` +
          `fs.writeSync(fd,mine);fs.closeSync(fd);fs.writeFileSync(${JSON.stringify(mineFile)},mine);setTimeout(()=>{},600000);`
      ],
      { stdio: "ignore", cwd: ws }
    );
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(mineFile) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    return fs.readFileSync(mineFile, "utf8");
  };

  /** The common shape of the one document, and the invariants of a command whose ledger refused its first event. */
  const expectLedgerFailure = (r: Run, doc: any, mine: string, before: { ledger: number; receipts: string[] }, expected: { outcome: string; effect: Record<string, unknown>; receiptsPublished: number }) => {
    expect(
      { exit: r.status, ok: doc.ok, command: doc.command, code: doc.code, outcome: doc.outcome, effect: doc.effect },
      describeRun(r)
    ).toEqual({ exit: 1, ok: false, command: "tx send", code: "EVENT_LEDGER_APPEND_FAILED", outcome: expected.outcome, effect: expected.effect });
    expect(doc.message).toContain("events.jsonl");
    expect({
      recorded: ledgerLines(ws).length - before.ledger,
      receiptsPublished: receiptsIn(ws).filter((f) => !before.receipts.includes(f)).length,
      holderLockIntact: fs.readFileSync(lockPathOf(ws), "utf8") === mine
    }).toEqual({ recorded: 0, receiptsPublished: expected.receiptsPublished, holderLockIntact: true });
  };

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-el2-json-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(async () => {
    await sdk.close();
    if (holder && holder.exitCode === null) {
      holder.kill();
      await new Promise((r) => setTimeout(r, 300));
    }
    holder = undefined;
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("1 · before anything is sent: outcome failed, not performed, no txId (nothing was planned), nothing executed", async () => {
    const mine = await holdLedger();
    const before = { ledger: ledgerLines(ws).length, receipts: receiptsIn(ws) };
    const r = cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], ws);
    const doc = theOneJson(r.stdout);
    expectLedgerFailure(r, doc, mine, before, { outcome: "failed", effect: { operation: "simulated-execution", outcome: "not-performed" }, receiptsPublished: 0 });
    expect(doc.message).toMatch(/^Nothing was executed: the ledger failed before the simulator ran the transaction\./);
  });

  it("2 · before the effect, after an artifact write (CLI-made plan and signed): outcome failed, not performed, the txId, the plan copy it wrote named", async () => {
    expect(cli(["tx", "plan", "alice", "dave", "--amount", "3", "--network", "simulated", "--out", "t.plan.json", "--json"], ws).status).toBe(0);
    expect(cli(["tx", "sign", "t.plan.json", "--out", "t.signed.json", "--json"], ws).status).toBe(0);
    const signed = JSON.parse(fs.readFileSync(path.join(ws, "t.signed.json"), "utf8"));
    const mine = await holdLedger();
    const before = { ledger: ledgerLines(ws).length, receipts: receiptsIn(ws) };
    const r = cli(["tx", "send", "t.signed.json", "--json"], ws);
    const doc = theOneJson(r.stdout);
    expectLedgerFailure(r, doc, mine, before, {
      outcome: "failed",
      effect: { operation: "simulated-execution", outcome: "not-performed", txId: signed.txId },
      receiptsPublished: 0
    });
    expect(doc.message).toMatch(/^Nothing was executed: the ledger failed before the simulator ran transaction synthetic-[0-9a-f]{64}\./);
    // what WAS written is named: the plan's canonical store entry (the simulator publishes it before the commit)
    const planCopy = /WAS written at (\S+txPlan-[0-9a-f]{64}\.json)/.exec(doc.message);
    expect(planCopy, doc.message).not.toBeNull();
    expect(fs.existsSync(planCopy![1]!)).toBe(true);
  });

  it("3 · after a known effect (SDK-made plan and signed; the simulator committed): outcome submitted, executed, the txId and the receipt", async () => {
    // the SDK writes both artifacts at their canonical store entries, so the send announces nothing before the commit
    const plan = await sdk.tx.plan({ from: "alice", to: "dave", amount: "3" } as any);
    const signed: any = await sdk.tx.sign(plan as any, "alice");
    fs.writeFileSync(path.join(ws, "t.signed.json"), JSON.stringify(signed, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    const mine = await holdLedger();
    const before = { ledger: ledgerLines(ws).length, receipts: receiptsIn(ws) };

    const r = cli(["tx", "send", "t.signed.json", "--json"], ws);
    const doc = theOneJson(r.stdout);
    // the effect took place: the one receipt the commit published is in the store, and the document names it
    const published = receiptsIn(ws).filter((f) => !before.receipts.includes(f));
    expect(published.length, describeRun(r)).toBe(1);
    const receipt = JSON.parse(fs.readFileSync(published[0]!, "utf8"));
    expectLedgerFailure(r, doc, mine, before, {
      outcome: "submitted",
      effect: { operation: "simulated-execution", outcome: "executed", txId: signed.txId, artifactId: receipt.contentHash, artifactPath: published[0] },
      receiptsPublished: 1
    });
    expect(receipt.txId).toBe(signed.txId);
    expect(doc.message).toMatch(/^The simulator EXECUTED transaction synthetic-[0-9a-f]{64}: the simulated state changed\./);
    expect(doc.message).toContain("Do not execute it again");
    expect(doc.message).not.toMatch(/Nothing was (sent|executed)|run the command again/);
  });
});
