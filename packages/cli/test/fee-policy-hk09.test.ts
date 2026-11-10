import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";

// HK-09 / CA-TX-03 / CA-TX-01 · `hardkas tx plan` without --fee-rate: the runner used to build a stand-in SDK without an
// RPC client, so the node's fee estimate was never asked (X3-02-tx.log: feeRate 100, evidence "heuristic"), and the
// floor rate was charged on the storage mass (0.2 KAS paid 5,000,000 sompi). Now the node the plan reads is asked, in the
// estimate's real shape, bounded, and the relay minimum is paid on the compute mass.

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const SPK = "20" + "00".repeat(32) + "ac";
const KAS = 100_000_000n;
const bucket = (feerate: number) => ({ feerate, estimatedSeconds: 1 });
const estimateOf = (priority: number, normal: number, low: number) => ({ estimate: { priorityBucket: bucket(priority), normalBuckets: [bucket(normal)], lowBuckets: [bucket(low)] } });

const node = {
  utxos: [{ outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 10n * KAS, scriptPublicKey: SPK, blockDaaScore: 1000n, isCoinbase: false }],
  feeEstimate: estimateOf(100, 100, 100) as unknown,
  feeEstimateCalls: 0
};

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class ScriptedClient {
    async getBlockDagInfo() {
      return { networkId: "simnet", virtualDaaScore: 1_000_000n, virtualParentHashes: ["p"], sink: "s", tipHashes: ["s"] };
    }
    async getUtxosByAddress() {
      return node.utxos.map((u) => ({ ...u }));
    }
    async getMempoolEntriesByAddresses() {
      return { entries: [] };
    }
    async getFeeEstimate() {
      node.feeEstimateCalls += 1;
      return node.feeEstimate;
    }
    async getInfo() {
      return { mempoolSize: 0 };
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: ScriptedClient };
});

describe("HK-09 · hardkas tx plan asks the node and pays the relay minimum", () => {
  const originalCwd = process.cwd();
  let ws: string;
  let config: any;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hk09-cli-"));
    fs.writeFileSync(
      path.join(ws, "hardkas.config.js"),
      `export default { defaultNetwork: "simnet", networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } } };`
    );
    process.chdir(ws);
    const { loadHardkasConfig } = await import("@hardkas/config");
    ({ config } = await loadHardkasConfig({ workspaceRoot: ws }));
  });
  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const plan = (amount: string) => runTxPlan({ from: FROM, to: TO, amount, networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", config, workspaceRoot: ws } as any);

  for (const amount of ["0.2", "1"]) {
    it(`${amount} KAS, node at the minimum: the node is asked, the plan pays 203,600 sompi (not 100 × storage mass)`, async () => {
      node.feeEstimate = estimateOf(100, 100, 100);
      const calls = node.feeEstimateCalls;
      const artifact: any = await plan(amount);
      expect(node.feeEstimateCalls).toBeGreaterThan(calls);
      expect(BigInt(artifact.estimatedFeeSompi)).toBe(203_600n);
    });
  }

  it("the normal bucket is used (priority 900, normal 300): fee = 300 × mass", async () => {
    node.feeEstimate = estimateOf(900, 300, 100);
    const artifact: any = await plan("5");
    // the Generator prices rate × max(compute, storage); its reported mass carries a few grams more (signature allowance)
    const fee = BigInt(artifact.estimatedFeeSompi);
    const mass = BigInt(artifact.estimatedMass);
    expect(fee).toBeGreaterThan(203_600n);
    expect(fee).toBeLessThanOrEqual(300n * mass);
    expect(fee).toBeGreaterThanOrEqual(300n * (mass - 10n));
  });

  it("a node rate of 1e6 sompi/g is refused (FEE_RATE_ABOVE_BOUND), never planned", async () => {
    node.feeEstimate = estimateOf(1e6, 1e6, 1e6);
    let code: string | undefined;
    try {
      await plan("0.2");
    } catch (e: any) {
      code = e?.code ?? e?.cause?.code;
    }
    expect(code).toBe("FEE_RATE_ABOVE_BOUND");
  });

  it("an explicit --fee-rate that buys more than the default limit (0.1 KAS) is refused (FEE_EXCEEDS_MAX)", async () => {
    node.feeEstimate = estimateOf(100, 100, 100);
    let code: string | undefined;
    try {
      await runTxPlan({ from: FROM, to: TO, amount: "0.2", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "5000", config, workspaceRoot: ws } as any);
    } catch (e: any) {
      code = e?.code;
    }
    expect(code).toBe("FEE_EXCEEDS_MAX");
  });
});
