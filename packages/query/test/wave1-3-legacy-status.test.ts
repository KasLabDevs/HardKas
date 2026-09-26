import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { QueryEngine, createQueryRequest } from "../src/engine.js";

// Wave 1.3 · Closure Pack IC-2′.8 / IC-4′.4 (R-iii part 1):
//   a `hardkas.txReceipt` v≤4 is a LEGACY submission; its `status`, `confirmedAt`
//   and `dagContext` were never authenticated and MUST NOT drive a decision.
//   The replay query domain (divergences / invariants) decides on `status` only
//   for FULL-scope receipts; otherwise it reports insufficient evidence.

function receiptBody(txId: string, status: string, overrides: Record<string, unknown> = {}) {
  return {
    schema: "hardkas.txReceipt",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    txId,
    status,
    mode: "simulator",
    networkId: "simnet",
    from: { address: "kaspa:alice" },
    to: { address: "kaspa:bob" },
    amountSompi: "100000",
    feeSompi: "250",
    daaScore: "42",
    spentUtxoIds: [],
    createdUtxoIds: [],
    preStateHash: "same",
    postStateHash: "same",
    createdAt: "2026-01-01T00:00:00Z",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    ...overrides
  };
}

function seal(body: Record<string, unknown>, hashVersion: number) {
  const a: any = { ...body, hashVersion };
  a.contentHash = calculateContentHash(a, hashVersion);
  return a;
}

describe("Wave 1.3 · replay queries never decide on a legacy status", () => {
  let tmpDir: string;
  let engine: QueryEngine;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hk-w13-query-"));
    const receiptsDir = path.join(tmpDir, ".hardkas", "receipts");
    await fs.mkdir(receiptsDir, { recursive: true });
    // Same content, two authentication scopes: `status: confirmed` with pre === post
    // is a state-transition divergence ONLY when the status is authenticated.
    await fs.writeFile(path.join(receiptsDir, "full.json"), JSON.stringify(seal(receiptBody("tx-full", "confirmed"), CURRENT_HASH_VERSION)));
    await fs.writeFile(path.join(receiptsDir, "legacy.json"), JSON.stringify(seal(receiptBody("tx-legacy", "confirmed"), 4)));
    engine = new QueryEngine({ artifactDir: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("divergences: the FULL-scope receipt is judged on its status; the legacy one yields insufficient evidence", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "replay", op: "divergences" }));
    const items = result.items as any[];
    const full = items.filter((d) => d.txId === "tx-full");
    expect(full.some((d) => d.field === "stateTransition")).toBe(true);
    const legacy = items.filter((d) => d.txId === "tx-legacy");
    expect(legacy.some((d) => d.field === "stateTransition")).toBe(false);
    expect(legacy.some((d) => d.field === "spentUtxoIds")).toBe(false);
    const evidence = legacy.find((d) => d.kind === "insufficient-evidence");
    expect(evidence).toBeDefined();
    expect(evidence.field).toBe("status");
    expect(evidence.actual).toMatch(/hashVersion 4/);
  });

  it("invariants: a legacy receipt's transition and conservation are NOT evaluated from its status", async () => {
    const legacy: any = (await engine.execute(createQueryRequest({ domain: "replay", op: "invariants", params: { txId: "tx-legacy" } }))).items[0];
    expect(legacy.authScope).toBe("LEGACY");
    expect(legacy.stateTransitionValid).toBe(false);
    expect(legacy.utxoConservation).toBe(false);
    expect(legacy.issues.some((i: string) => /status/.test(i) && /not authenticated/.test(i))).toBe(true);
    expect(legacy.issues.some((i: string) => /did not change state/.test(i))).toBe(false);

    const full: any = (await engine.execute(createQueryRequest({ domain: "replay", op: "invariants", params: { txId: "tx-full" } }))).items[0];
    expect(full.authScope).toBe("FULL");
    expect(full.stateTransitionValid).toBe(false);
    expect(full.issues.some((i: string) => /did not change state/.test(i))).toBe(true);
  });
});
