import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { Hardkas } from "../src/index.js";
import { refusePlanHeaderMismatch } from "../src/tx.js";

// AUDIT 2026-11-21 · A2 (TX-PLAN-HEADER-1). A plan's contentHash is unkeyed: a rewritten plan re-hashes cleanly and
// `artifact verify` passes it. What this closes: a plan that SHOWS one payment (header `to` / `amountSompi`, read by
// `tx sign`, `artifact inspect` and reviewers) and SIGNS another (its outputs). A consistently rewritten plan is still
// signable — the signer must read what it signs; that is stated by `artifact verify` (Origin: NOT_AUTHENTICATED).

const rehash = (p: any) => {
  const { contentHash: _c, planId: _p, ...body } = p;
  const h = calculateContentHash(body, CURRENT_HASH_VERSION);
  return { ...body, contentHash: h, planId: p.planId };
};

describe("TX-PLAN-HEADER-1 · a plan's header must be what its outputs pay", () => {
  let dir: string;
  let hk: Hardkas;
  let plan: any;
  let carol: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tph1-"));
    hk = await Hardkas.create({ network: "simulated", autoBootstrap: true, cwd: dir });
    plan = await hk.tx.plan({ from: "alice", to: "bob", amount: 5 });
    carol = (await hk.accounts.resolve("carol")).address;
  });
  afterAll(async () => {
    await hk.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("TPH-1 control: the plan as planned is consistent and signs", async () => {
    expect(() => refusePlanHeaderMismatch(plan)).not.toThrow();
    const signed = await hk.tx.sign(plan, "alice");
    expect(String((signed as any).schema)).toMatch(/signedTx/i);
  });

  it("TPH-2 outputs redirected to another address, header untouched, re-hashed: refused at sign", async () => {
    const evil = rehash({ ...plan, outputs: plan.outputs.map((o: any) => ({ ...o, address: carol })) });
    await expect(hk.tx.sign(evil, "alice")).rejects.toMatchObject({ code: "TX_PLAN_HEADER_MISMATCH" });
  });

  it("TPH-3 an output amount raised, header untouched, re-hashed: refused at sign", async () => {
    const first = plan.outputs[0];
    const evil = rehash({ ...plan, outputs: [{ ...first, amountSompi: (BigInt(first.amountSompi) + 100_000_000n).toString() }, ...plan.outputs.slice(1)] });
    await expect(hk.tx.sign(evil, "alice")).rejects.toMatchObject({ code: "TX_PLAN_HEADER_MISMATCH" });
  });

  it("TPH-4 a plan with no payment outputs (sweep / consolidation) and other schemas are not this check's", () => {
    expect(() => refusePlanHeaderMismatch({ ...plan, outputs: [] })).not.toThrow();
    expect(() => refusePlanHeaderMismatch({ schema: "hardkas.other.v1", outputs: [{ address: "x", amountSompi: "1" }], amountSompi: "2" })).not.toThrow();
  });
});
