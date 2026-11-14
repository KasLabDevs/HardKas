import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";

// D-02 · freshness is the executors' rule, not integrity's. `artifact verify` reports age as a warning and never fails an
// intact artifact for it; signing a plan and sending or executing a signed transaction older than 30 days (or one that
// descends from such a plan) is refused at the call site with STALE_ARTIFACT_REFUSED, before anything is signed,
// executed or written. Receipts are records of the past: they keep verifying.

const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("D-02 · signing and sending refuse a stale plan or signed transaction; verification does not", () => {
  let ws: string;
  let sdk: Hardkas;
  let previous: string | undefined;

  beforeEach(async () => {
    previous = process.env.HARDKAS_TEST_IGNORE_STALENESS;
    delete process.env.HARDKAS_TEST_IGNORE_STALENESS;
    vi.useFakeTimers({ toFake: ["Date"], now: T0 });
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-d02-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previous === undefined) delete process.env.HARDKAS_TEST_IGNORE_STALENESS;
    else process.env.HARDKAS_TEST_IGNORE_STALENESS = previous;
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const receipts = () => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  };

  it("a plan 31 days old is not signed (STALE_ARTIFACT_REFUSED), and still verifies", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    await sdk.artifacts.write(plan);
    vi.setSystemTime(T0 + 31 * DAY);
    expect(await codeOf(sdk.tx.sign(plan, "alice"))).toBe("STALE_ARTIFACT_REFUSED");
    const verdict: any = await sdk.artifacts.verify(plan, { strict: true, enforceMetadata: false, throwOnInvalid: false });
    expect(verdict.valid).toBe(true);
  });

  it("a signed transaction 31 days old is neither executed nor sent; nothing is written", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    const signed = await sdk.tx.sign(plan, "alice");
    const before = receipts();
    vi.setSystemTime(T0 + 31 * DAY);
    expect(await codeOf(sdk.tx.simulate(signed))).toBe("STALE_ARTIFACT_REFUSED");
    expect(await codeOf(sdk.tx.send(signed))).toBe("STALE_ARTIFACT_REFUSED");
    expect(receipts()).toEqual(before);
  });

  it("a signed transaction 2 days old whose plan is 31 days old is refused too (the plan's view of the UTXOs is what ages)", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    await sdk.artifacts.write(plan);
    vi.setSystemTime(T0 + 29 * DAY);
    const signed = await sdk.tx.sign(plan, "alice");
    vi.setSystemTime(T0 + 31 * DAY);
    expect(await codeOf(sdk.tx.send(signed))).toBe("STALE_ARTIFACT_REFUSED");
    expect(await codeOf(sdk.tx.simulate(signed))).toBe("STALE_ARTIFACT_REFUSED");
  });

  it("re-audit F3: a multisig transaction completed with an append, whose plan is 31 days old, is not sent (the plan is found past the partial signature)", async () => {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    await sdk.artifacts.write(plan);
    const alice: any = await sdk.accounts.resolve("alice");
    const bob: any = await sdk.accounts.resolve("bob");
    const carol: any = await sdk.accounts.resolve("carol");
    vi.setSystemTime(T0 + 28 * DAY);
    const partial: any = await sdk.tx.sign(plan, "alice", { threshold: 2, requiredSigners: [alice.address, bob.address, carol.address] });
    await sdk.artifacts.write(partial);
    vi.setSystemTime(T0 + 29 * DAY);
    const complete: any = await sdk.tx.sign(partial, "bob", { append: true });
    expect(complete.status).toBe("signed");
    // its lineage parent is the partial signed transaction, not the plan
    expect(complete.lineage?.parentArtifactId).not.toBe(plan.contentHash);
    const before = receipts();
    vi.setSystemTime(T0 + 31 * DAY);
    expect(await codeOf(sdk.tx.send(complete))).toBe("STALE_ARTIFACT_REFUSED");
    expect(await codeOf(sdk.tx.simulate(complete))).toBe("STALE_ARTIFACT_REFUSED");
    expect(receipts()).toEqual(before);
  });

  it("within 30 days everything executes; the receipt 40 days later still verifies (a record of the past does not expire)", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    vi.setSystemTime(T0 + 29 * DAY);
    const signed = await sdk.tx.sign(plan, "alice");
    const { receipt } = await sdk.tx.simulate(signed);
    expect(receipt.txId).toBe(`synthetic-${plan.contentHash}`);
    vi.setSystemTime(T0 + 29 * DAY + 40 * DAY);
    const verdict: any = await sdk.artifacts.verify(receipt, { strict: true, enforceMetadata: false, throwOnInvalid: false });
    expect(verdict.valid, JSON.stringify(verdict)).toBe(true);
    // the receipt's own (non-strict) semantic pass carries the age, as a warning
    const { verifyArtifactSemantics } = await import("@hardkas/artifacts");
    const stale = verifyArtifactSemantics(structuredClone(receipt)).issues.find((i) => i.code === "STALE_ARTIFACT");
    expect(stale?.severity).toBe("warning");
    expect(stale?.message).toMatch(/40 days old/);
  });
});
