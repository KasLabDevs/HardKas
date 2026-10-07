import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { withSimulatorState, saveLocalnetState, resetLocalnetState, fundAddress, getDefaultLocalnetStatePath } from "@hardkas/localnet";

vi.setConfig({ testTimeout: 60_000 });

// SIMULATOR-DURABLE-EXECUTION-1 (F1, design D): once a simulated ledger transition is durable, enough is committed with it
// to publish or recover its canonical evidence (state snapshot, receipt, trace), byte for byte, without applying the
// transition again. SIMULATOR-RECOVERY-FIRST-1: every simulated ledger mutation takes `simulator-state`, settles a pending
// execution first, and mutates nothing when that recovery cannot converge.
// Measured before the fix (2026-10-04, cut27 matrix-1): a crash or an IO error between the ledger write and the receipt
// left money moved with no receipt; re-sending the same signed artifact then failed forever ("invalid simulated input");
// a retried shortcut paid again while the first payment had no evidence.
// An interrupted execution is reproduced here with an IO error injected before one exact rename (every file is written
// through temp + rename): the durable state it leaves is the one a crash at that step leaves.

const SOMPI = 100_000_000n;
const FIXED_CLOCK = new Date("2026-10-04T10:00:00.000Z");
const realRename = fs.renameSync;

describe("SIMULATOR-DURABLE-EXECUTION-1 · an interrupted simulated execution is finished, never applied twice", () => {
  let ws: string;
  let sdk: Hardkas;
  const scratch: string[] = [];

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-durable-exec-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const d of [ws, ...scratch.splice(0)]) fs.rmSync(d, { recursive: true, force: true });
  });

  const ledgerPath = () => getDefaultLocalnetStatePath(ws);
  const ledger = () => JSON.parse(fs.readFileSync(ledgerPath(), "utf-8"));
  const store = (...p: string[]) => path.join(ws, ".hardkas", "artifacts", ...p);
  const unspent = (name: string): bigint => {
    const state = ledger();
    const address = state.accounts.find((a: any) => a.name === name).address;
    return state.utxos.filter((u: any) => u.address === address && !u.spent).reduce((s: bigint, u: any) => s + BigInt(u.amountSompi), 0n);
  };
  const receipts = (): any[] =>
    fs.existsSync(store("receipts")) ? fs.readdirSync(store("receipts")).filter((n) => n.endsWith(".json") && !n.startsWith(".tmp.")).map((n) => JSON.parse(fs.readFileSync(store("receipts", n), "utf-8"))) : [];
  const receiptsTo = (name: string) => receipts().filter((r) => r.to?.address === `kaspa:sim_${name}`).length;
  const signedTransfer = async (from: string, to: string, amount: string) => {
    const plan = await sdk.tx.plan({ from: `kaspa:sim_${from}`, to: `kaspa:sim_${to}`, amount });
    await sdk.artifacts.write(plan);
    return sdk.tx.sign(plan, `kaspa:sim_${from}`, { persist: false });
  };
  /** An IO error right before the nth rename whose destination matches: the execution stops there, as a crash would. */
  const failBeforeRename = (pattern: RegExp, nth = 1) => {
    let seen = 0;
    return vi.spyOn(fs, "renameSync").mockImplementation(((src: fs.PathLike, dst: fs.PathLike) => {
      if (pattern.test(String(dst)) && ++seen === nth) throw Object.assign(new Error(`EHKFAULT before rename of ${String(dst)}`), { code: "EHKFAULT" });
      return realRename.call(fs, src, dst);
    }) as typeof fs.renameSync);
  };
  /** Every rename that lands, for asserting what a recovery rewrites. */
  const recordRenames = () => {
    const landed: string[] = [];
    const spy = vi.spyOn(fs, "renameSync").mockImplementation(((src: fs.PathLike, dst: fs.PathLike) => {
      landed.push(String(dst));
      return realRename.call(fs, src, dst);
    }) as typeof fs.renameSync);
    return { landed, spy };
  };
  const settle = () => withSimulatorState(ws, async () => {}); // the next unit settles a pending execution first
  /** The exact bytes of a transaction's canonical evidence and of the ledger. */
  const evidenceBytes = (txId: string) => {
    const receipt = receipts().find((r) => r.txId === txId);
    const snapshotName = fs.readdirSync(store("misc")).find((n) => n.endsWith(".json") && !n.startsWith(".tmp.") && JSON.parse(fs.readFileSync(store("misc", n), "utf-8")).stateHash === receipt?.postStateHash);
    const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p).toString("base64") : null);
    return {
      receipt: receipt ? read(store("receipts", `txReceipt-${receipt.contentHash}.json`)) : null,
      stateSnapshot: snapshotName ? read(store("misc", snapshotName)) : null,
      trace: read(store(`${txId}.trace.json`)),
      ledger: read(ledgerPath())
    };
  };
  const snapshotWorkspace = () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), "hk-durable-exec-copy-"));
    scratch.push(copy);
    fs.cpSync(ws, copy, { recursive: true });
    return () => {
      for (const n of fs.readdirSync(ws)) fs.rmSync(path.join(ws, n), { recursive: true, force: true });
      fs.cpSync(copy, ws, { recursive: true });
    };
  };
  const plant = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(store(rel)), { recursive: true });
    fs.writeFileSync(store(rel), text);
  };

  // ---- the F1 failures (they fail before the fix)

  it("re-sending a signed transfer whose ledger write landed without its receipt returns that receipt and pays once", async () => {
    const signed = await signedTransfer("alice", "bob", "5");
    const bob0 = unspent("bob");
    const fault = failBeforeRename(/receipts[\\/]txReceipt-/);
    await expect(sdk.tx.simulate(signed)).rejects.toThrow();
    fault.mockRestore();
    expect(unspent("bob") - bob0, "the interrupted execution already moved the money").toBe(5n * SOMPI);

    const retry = await sdk.tx.simulate(signed);
    expect(retry.receipt.txId).toBe(signed.txId);
    expect(fs.existsSync(retry.receiptPath!)).toBe(true);
    expect(fs.existsSync(store(`${signed.txId}.trace.json`))).toBe(true);
    expect(unspent("bob") - bob0, "paid once").toBe(5n * SOMPI);
  });

  it("the ledger write that moves the money records how to finish the execution", async () => {
    const signed = await signedTransfer("alice", "bob", "5");
    const fault = failBeforeRename(/misc[\\/]snapshot-/);
    await expect(sdk.tx.simulate(signed)).rejects.toThrow();
    fault.mockRestore();
    const record = ledger().pendingExecution;
    expect(record?.schema).toBe("hardkas.pendingExecution.v1");
    expect(record?.txId).toBe(signed.txId);
    expect(record?.executedArtifactId).toBe(signed.contentHash);
  });

  it("a payment intent retried after an interrupted execution leaves every payment in the ledger with its receipt", async () => {
    const bob0 = unspent("bob");
    const receipts0 = receiptsTo("bob");
    const first = await signedTransfer("alice", "bob", "5");
    const fault = failBeforeRename(/receipts[\\/]txReceipt-/);
    await expect(sdk.tx.simulate(first)).rejects.toThrow();
    fault.mockRestore();
    // what `tx send --from --to --amount` does on a retry: it plans the same intent again from the ledger as it is now
    const again = await signedTransfer("alice", "bob", "5");
    await sdk.tx.simulate(again);
    expect((unspent("bob") - bob0) / (5n * SOMPI), "two payments reached the ledger (each shortcut is a new intent)").toBe(2n);
    expect(receiptsTo("bob") - receipts0, "and each of them has its receipt").toBe(2);
  });

  // ---- recovery: exact bytes, every interruption point, crash during recovery

  it.each([
    ["the ledger committed, no evidence yet", /misc[\\/]snapshot-/, 1],
    ["the state snapshot published, no receipt", /receipts[\\/]txReceipt-/, 1],
    ["the receipt published, no trace", /\.trace\.json$/, 1],
    ["all evidence published, the pending record not cleared", /localnet\.json$/, 2]
  ])("%s: recovery publishes exactly the bytes of an uninterrupted execution and the same final ledger", async (_name, at, nth) => {
    const signed = await signedTransfer("alice", "bob", "5");
    const bob0 = unspent("bob");
    const restore = snapshotWorkspace();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_CLOCK);
    await sdk.tx.simulate(signed);
    const control = evidenceBytes(signed.txId!);
    expect(Object.values(control).every((v) => v !== null), "the uninterrupted execution's evidence").toBe(true);
    restore();

    const fault = failBeforeRename(at, nth);
    await expect(sdk.tx.simulate(signed)).rejects.toThrow();
    fault.mockRestore();
    expect(ledger().pendingExecution?.txId).toBe(signed.txId);

    const { landed } = recordRenames();
    await settle();
    expect(evidenceBytes(signed.txId!)).toEqual(control);
    expect(ledger().pendingExecution).toBeUndefined();
    expect(unspent("bob") - bob0, "applied once").toBe(5n * SOMPI);
    // evidence that was already there with its exact bytes is kept, never rewritten
    const published = landed.filter((p) => !/localnet\.json$/.test(p));
    if (nth === 2) expect(published, "nothing republished").toEqual([]);

    // recover(recover(s)) = recover(s): a further unit writes nothing
    const again = recordRenames();
    const before = fs.readFileSync(ledgerPath());
    await settle();
    expect(again.landed).toEqual([]);
    expect(fs.readFileSync(ledgerPath()).equals(before)).toBe(true);
  });

  it("a recovery interrupted while publishing is finished by the next one", async () => {
    const signed = await signedTransfer("alice", "bob", "5");
    const bob0 = unspent("bob");
    const restore = snapshotWorkspace();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_CLOCK);
    await sdk.tx.simulate(signed);
    const control = evidenceBytes(signed.txId!);
    expect(Object.values(control).every((v) => v !== null), "the uninterrupted execution's evidence").toBe(true);
    restore();

    let fault = failBeforeRename(/misc[\\/]snapshot-/);
    await expect(sdk.tx.simulate(signed)).rejects.toThrow();
    fault.mockRestore();
    fault = failBeforeRename(/receipts[\\/]txReceipt-/);
    await expect(settle()).rejects.toThrow();
    fault.mockRestore();
    expect(ledger().pendingExecution?.txId, "still pending after the interrupted recovery").toBe(signed.txId);

    const retry = await sdk.tx.simulate(signed);
    expect(retry.receipt.txId).toBe(signed.txId);
    expect(evidenceBytes(signed.txId!)).toEqual(control);
    expect(unspent("bob") - bob0).toBe(5n * SOMPI);
  });

  it("settles a pending execution before the next execution, which then runs normally", async () => {
    const toBob = await signedTransfer("alice", "bob", "5");
    const toDave = await signedTransfer("carol", "dave", "7");
    const bob0 = unspent("bob");
    const dave0 = unspent("dave");
    const fault = failBeforeRename(/misc[\\/]snapshot-/);
    await expect(sdk.tx.simulate(toBob)).rejects.toThrow();
    fault.mockRestore();

    await sdk.tx.simulate(toDave);
    expect(receipts().some((r) => r.txId === toBob.txId), "the first execution's receipt").toBe(true);
    expect(receipts().some((r) => r.txId === toDave.txId), "the second execution's receipt").toBe(true);
    expect(fs.existsSync(store(`${toBob.txId}.trace.json`))).toBe(true);
    expect(ledger().pendingExecution).toBeUndefined();
    expect(unspent("bob") - bob0).toBe(5n * SOMPI);
    expect(unspent("dave") - dave0).toBe(7n * SOMPI);
  });

  // ---- fail closed: the record stays, nothing is published, no mutation runs

  describe("fails closed, keeping the pending record and refusing any new mutation", () => {
    /** An execution interrupted right after its ledger commit, plus what an uninterrupted one would have published. */
    const committedWithoutEvidence = async () => {
      const signed = await signedTransfer("alice", "bob", "5");
      const restore = snapshotWorkspace();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(FIXED_CLOCK);
      await sdk.tx.simulate(signed);
      const receipt = receipts().find((r) => r.txId === signed.txId);
      const receiptRel = path.join("receipts", `txReceipt-${receipt.contentHash}.json`);
      const receiptText = fs.readFileSync(store(receiptRel), "utf-8");
      restore();
      const fault = failBeforeRename(/misc[\\/]snapshot-/);
      await expect(sdk.tx.simulate(signed)).rejects.toThrow();
      fault.mockRestore();
      vi.useRealTimers();
      return { signed, receiptRel, receiptText };
    };
    const expectRefusedAndUntouched = async (code: string) => {
      const before = fs.readFileSync(ledgerPath());
      const storeBefore = fs.readdirSync(store(), { recursive: true }).length;
      await expect(settle()).rejects.toMatchObject({ code });
      const other = await signedTransfer("carol", "dave", "7");
      await expect(sdk.tx.simulate(other)).rejects.toMatchObject({ code });
      expect(fs.readFileSync(ledgerPath()).equals(before), "the ledger is untouched").toBe(true);
      expect(ledger().pendingExecution, "the pending record is kept").toBeDefined();
      return storeBefore;
    };

    it("the expected receipt path holds the same identity with other bytes (RECOVERY_CONFLICT)", async () => {
      const { receiptRel, receiptText } = await committedWithoutEvidence();
      const variant = JSON.parse(receiptText);
      variant.createdAt = "2000-01-01T00:00:00.000Z"; // outside the hash: same identity, other bytes
      plant(receiptRel, JSON.stringify(variant, null, 2) + "\n");
      await expectRefusedAndUntouched("RECOVERY_CONFLICT");
      expect(fs.readdirSync(store("misc")).some((n) => n.startsWith("snapshot-") && JSON.parse(fs.readFileSync(store("misc", n), "utf-8")).stateHash === ledger().pendingExecution.postStateHash), "nothing was published").toBe(false);
    });

    it("the expected receipt path holds another identity (RECOVERY_CONFLICT)", async () => {
      const { receiptRel, receiptText } = await committedWithoutEvidence();
      const other = JSON.parse(receiptText);
      other.amountSompi = "1"; // inside the hash
      plant(receiptRel, JSON.stringify(other, null, 2) + "\n");
      await expectRefusedAndUntouched("RECOVERY_CONFLICT");
    });

    it("the executed signed artifact is gone from the store (RECOVERY_MATERIAL_MISSING)", async () => {
      const { signed } = await committedWithoutEvidence();
      for (const n of fs.readdirSync(store("signed"))) {
        if (JSON.parse(fs.readFileSync(store("signed", n), "utf-8")).contentHash === signed.contentHash) fs.rmSync(store("signed", n));
      }
      await expectRefusedAndUntouched("RECOVERY_MATERIAL_MISSING");
    });

    it.each([
      ["a record of an unknown version", (r: any) => (r.schema = "hardkas.pendingExecution.v9"), "PENDING_EXECUTION_UNSUPPORTED"],
      ["a record written by another build", (r: any) => (r.format.hardkasVersion = "0.0.0-other"), "RECOVERY_FORMAT_MISMATCH"],
      ["a ledger moved past its record", (_r: any, L: any) => (L.daaScore = String(BigInt(L.daaScore) + 1n)), "PENDING_EXECUTION_STALE"],
      ["a record whose transition does not undo to its pre-state", (r: any) => (r.preStateHash = "0".repeat(64)), "RECOVERY_INVERSION_MISMATCH"],
      ["a record whose evidence identities do not match", (r: any) => (r.expected.receipt = "0".repeat(64)), "RECOVERY_DIVERGED"]
    ])("%s", async (_name, edit, code) => {
      await committedWithoutEvidence();
      const L = ledger();
      edit(L.pendingExecution, L);
      fs.writeFileSync(ledgerPath(), JSON.stringify(L, null, 2));
      await expectRefusedAndUntouched(code as string);
    });
  });

  // ---- SIMULATOR-RECOVERY-FIRST-1 for the other writers of the simulated state

  describe("the other ledger writers settle a pending execution before they mutate", () => {
    const interrupted = async () => {
      const signed = await signedTransfer("alice", "bob", "5");
      const fault = failBeforeRename(/misc[\\/]snapshot-/);
      await expect(sdk.tx.simulate(signed)).rejects.toThrow();
      fault.mockRestore();
      return signed;
    };

    it("a faucet transfer (the fund runner's unit)", async () => {
      const signed = await interrupted();
      const erin0 = unspent("erin");
      await withSimulatorState(ws, async () => {
        const state = ledger();
        const erin = state.accounts.find((a: any) => a.name === "erin").address;
        await saveLocalnetState(fundAddress(state, { address: erin, amountSompi: 3n * SOMPI }), ledgerPath());
      });
      expect(receipts().some((r) => r.txId === signed.txId), "the pending execution's receipt was published first").toBe(true);
      expect(ledger().pendingExecution).toBeUndefined();
      expect(unspent("erin") - erin0).toBe(3n * SOMPI);
    });

    it("a writer holding a copy of the state read before the recovery does not bring the record back", async () => {
      const signed = await interrupted();
      const stale = ledger(); // read outside any unit, record included
      expect(stale.pendingExecution).toBeDefined();
      await saveLocalnetState({ ...stale, daaScore: stale.daaScore }, ledgerPath());
      expect(receipts().some((r) => r.txId === signed.txId)).toBe(true);
      expect(ledger().pendingExecution, "never persisted again").toBeUndefined();
    });

    it("a reset publishes the pending execution's evidence, then writes the fresh state", async () => {
      const signed = await interrupted();
      await resetLocalnetState({ cwd: ws });
      expect(receipts().some((r) => r.txId === signed.txId)).toBe(true);
      expect(ledger().pendingExecution).toBeUndefined();
      expect(ledger().daaScore).toBe("0");
    });

    it("a writer is refused while the pending execution cannot be recovered", async () => {
      await interrupted();
      const L = ledger();
      L.pendingExecution.schema = "hardkas.pendingExecution.v9";
      fs.writeFileSync(ledgerPath(), JSON.stringify(L, null, 2));
      const before = fs.readFileSync(ledgerPath());
      await expect(resetLocalnetState({ cwd: ws })).rejects.toMatchObject({ code: "PENDING_EXECUTION_UNSUPPORTED" });
      expect(fs.readFileSync(ledgerPath()).equals(before)).toBe(true);
    });
  });
});
