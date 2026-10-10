import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { coreEvents, EventLedgerAppendError } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, storeEntryFor } from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 120_000 });

// EVENT-LEDGER-2 · reviewer final closeout, decision A1. The attached ledger still throws EVENT_LEDGER_APPEND_FAILED,
// and at an execution or broadcast boundary the failure names what the step had already done (metadata.effect, and a
// message that leads with it):
//  - effect confirmed: the node accepted the submission request (RPC acceptance, not acceptance or confirmation in the
//    DAG), or the simulator executed the transaction — txId and artifact kept;
//  - outcome unknown: the submit call failed without an answer — never presented as a rejection;
//  - rejected: the node answered with a rejection;
//  - not performed: the ledger failed before anything was sent or executed.
// A broadcast or an execution that took place is never described as an operation that did not happen.
//
// How the ledger is made to fail at one precise event: a persistence sink that behaves exactly as the attached ledger
// does when it cannot append (it throws the ledger's own EventLedgerAppendError for the events it selects) and lets every
// other event through. The real-broadcast branch is reached as in wave1-3-b2: a simulated workspace plans and signs, the
// signed artifact is re-issued as a non-synthetic v5 artifact, the instance reports a non-simulated network, and
// `rpc.submitTransaction` is the only stub. The simulator cases run the real simulator.

const LOOPBACK = "http://127.0.0.1:16110";
const NODE_TX = "b".repeat(64);

function asBroadcastable(signed: any): any {
  const s: any = structuredClone(signed);
  delete s.authorization;
  s.signedTransaction = { format: "hex", payload: "deadbeef" };
  s.txId = "f".repeat(64);
  delete s.contentHash;
  s.lineage = { ...s.lineage, artifactId: "" };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

/** Every artifact file under the workspace store whose JSON satisfies `pred`. */
function storedWhere(ws: string, pred: (a: any) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (p.endsWith(".json")) {
        try {
          if (pred(JSON.parse(fs.readFileSync(p, "utf8")))) out.push(p);
        } catch {
          // not an artifact
        }
      }
    }
  };
  walk(path.join(ws, ".hardkas", "artifacts"));
  return out;
}

describe("EVENT-LEDGER-2 final closeout · A1 a ledger failure names the effect its step already had", () => {
  let ws: string;
  let detach: (() => void) | undefined;
  let passed: any[];

  /** The ledger fails for the events `fails` selects (as the attached ledger fails), and takes every other one. */
  const ledgerFailingOn = (fails: (e: any) => boolean) => {
    detach = coreEvents.persistWith((event: any) => {
      if (fails(event)) throw new EventLedgerAppendError(path.join(ws, "events.jsonl"), event, new Error("no space left on the ledger's disk (test double)."));
      passed.push(event);
    });
  };

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-el2-effect-"));
    passed = [];
  });

  afterEach(() => {
    detach?.();
    detach = undefined;
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  async function realBroadcast(submit: () => Promise<any>) {
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" } as any);
    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"));
    Object.defineProperty(sdk, "network", { get: () => "simnet", configurable: true });
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(submit as any);
    return { sdk, signed };
  }

  it("accepted broadcast, then the submission's artifact.written is lost: the failure says the transaction WAS sent (RPC acceptance, not DAG)", async () => {
    const { sdk, signed } = await realBroadcast(() => Promise.resolve({ transactionId: NODE_TX }));
    ledgerFailingOn((e) => e.kind === "artifact.written");
    const err: any = await sdk.tx.send(signed, LOOPBACK).then(() => undefined, (e) => e);
    expect(err?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    expect(err.metadata?.effect).toMatchObject({ operation: "broadcast", outcome: "accepted", txId: NODE_TX });
    expect(err.metadata.effect.artifactId).toBe(err.metadata.event.artifactId); // the submission that was written
    expect(fs.existsSync(err.metadata.event.path), "the submission WAS written").toBe(true);
    expect(err.message).toMatch(/ACCEPTED the submission of transaction b{64}/);
    expect(err.message).toMatch(/not acceptance or confirmation in the DAG\): it WAS sent/);
    expect(err.message).not.toMatch(/Nothing was sent|may already have been executed or submitted/);
  });

  it("accepted broadcast, then its result event is lost: the failure names the accepted submission and where it is recorded", async () => {
    const { sdk, signed } = await realBroadcast(() => Promise.resolve({ transactionId: NODE_TX }));
    ledgerFailingOn((e) => e.sourceSubsystem === "sdk:tx-send");
    const err: any = await sdk.tx.send(signed, LOOPBACK).then(() => undefined, (e) => e);
    expect(err?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    const effect = err.metadata?.effect;
    expect(effect).toMatchObject({ operation: "broadcast", outcome: "accepted", txId: NODE_TX });
    expect(fs.existsSync(effect.artifactPath), "the submission artifact it names exists").toBe(true);
    expect(JSON.parse(fs.readFileSync(effect.artifactPath, "utf8")).contentHash).toBe(effect.artifactId);
    expect(err.message).toMatch(/it WAS sent/);
  });

  it("a submit call that failed without an answer, then its result event is lost: the outcome is UNKNOWN, never a rejection", async () => {
    const { sdk, signed } = await realBroadcast(() => Promise.reject(new Error("RPC request submitTransaction timed out after 5000ms")));
    ledgerFailingOn((e) => e.sourceSubsystem === "sdk:tx-send");
    const err: any = await sdk.tx.send(signed, LOOPBACK).then(() => undefined, (e) => e);
    expect(err?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    // a failed call records no txId from the node; the effect names the transaction that was sent (the signed artifact's)
    expect(err.metadata?.effect).toMatchObject({ operation: "broadcast", outcome: "unknown", txId: "f".repeat(64) });
    expect(err.message).toMatch(/is UNKNOWN: the submit call failed without an answer from the node, which may have received it/);
    expect(err.message).not.toMatch(/REJECTED|rejected/);
    expect(passed.filter((e) => e.kind === "workflow.failed"), "no failure event either: nothing says it was rejected").toEqual([]);
  });

  it("a submission the node rejected, then its result event is lost: the failure says REJECTED, with the submission", async () => {
    const { sdk, signed } = await realBroadcast(() =>
      Promise.reject(new Error(`Rejected transaction ${"f".repeat(64)}: transaction ${"f".repeat(64)} is an orphan where orphan is disallowed`))
    );
    ledgerFailingOn((e) => e.sourceSubsystem === "sdk:tx-send");
    const err: any = await sdk.tx.send(signed, LOOPBACK).then(() => undefined, (e) => e);
    expect(err?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    expect(err.metadata?.effect).toMatchObject({ operation: "broadcast", outcome: "rejected" });
    expect(err.message).toMatch(/The node REJECTED transaction/);
  });

  it("the simulator executed, then the receipt's announcement is lost: the failure says EXECUTED and names the receipt", async () => {
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const signed: any = await sdk.tx.sign((await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" } as any)) as any, "alice");
    ledgerFailingOn((e) => e.sourceSubsystem === "sdk:tx-simulate");
    const err: any = await sdk.tx.simulate(signed).then(() => undefined, (e) => e);
    expect(err?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    const effect = err.metadata?.effect;
    expect(effect).toMatchObject({ operation: "simulated-execution", outcome: "executed" });
    expect(fs.existsSync(effect.artifactPath), "the receipt the commit published").toBe(true);
    expect(err.message).toMatch(/The simulator EXECUTED transaction .*Do not execute it again/);
    // it did execute: once the ledger takes events again, the same artifact resolves to that receipt (idempotent)
    detach?.();
    detach = undefined;
    const again = await sdk.tx.simulate(signed);
    expect((again.receipt as any).contentHash).toBe(effect.artifactId);
  });

  it("the ledger fails before the simulator runs (the executed artifact's store write): nothing was executed, and the failure says so", async () => {
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const signed: any = await sdk.tx.sign((await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" } as any)) as any, "alice");
    // the executed artifact missing from the store: the execution writes it again before it moves the state
    fs.unlinkSync(path.join(ws, ".hardkas", "artifacts", storeEntryFor(signed).rel));
    ledgerFailingOn((e) => e.kind === "artifact.written" && e.artifactId === signed.contentHash);
    const err: any = await sdk.tx.simulate(signed).then(() => undefined, (e) => e);
    expect(err?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    expect(err.metadata?.effect).toMatchObject({ operation: "simulated-execution", outcome: "not-performed" });
    expect(err.message).toMatch(/^Nothing was executed/);
    const receipts = storedWhere(ws, (a) => String(a?.schema).startsWith("hardkas.txReceipt") && a?.lineage?.parentArtifactId === signed.contentHash);
    expect(receipts, "no receipt: the simulated state did not move").toEqual([]);
  });

  it("a workflow's tx.simulate step: the receipt's store announcement after the execution is lost, and the step's error says EXECUTED", async () => {
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    let receiptId: string | undefined;
    ledgerFailingOn((e) => {
      if (e.kind === "artifact.written" && e.sourceSubsystem === "sdk:tx-simulate") receiptId = e.artifactId;
      return e.kind === "artifact.written" && e.sourceSubsystem === "sdk:artifacts-manager" && receiptId !== undefined && e.artifactId === receiptId;
    });
    const run: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: "alice", to: "bob", amount: 1 } as any, { type: "tx.simulate" } as any] });
    expect(receiptId, "precondition: the simulator executed and announced its receipt").toMatch(/^[0-9a-f]{64}$/);
    expect(run.status).toBe("failed");
    expect(run.errorEnvelope?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
    expect(run.errorEnvelope?.message).toMatch(/The simulator EXECUTED transaction/);
  });
});
