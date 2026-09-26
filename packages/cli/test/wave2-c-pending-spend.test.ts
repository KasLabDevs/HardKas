import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";
import { Hardkas } from "@hardkas/sdk";
import { derivePendingSpentOutpoints, observePendingSpends } from "@hardkas/tx-builder";

// Wave 2(c) · AUD-19 · T-A19 — pending-spend exclusion with mempool evidence
//   Before the snapshot reaches the Generator, every outpoint a mempool transaction of the
//   sender is spending is excluded; the exclusion is tied to ONE mempool observation taken
//   with the snapshot (recency anchor = the virtual DAA score); no evidence ⇒ no plan;
//   all excluded ⇒ an explicit error; receiving entries never exclude; the recorded evidence
//   is observer-local and never a network guarantee. CLI ≡ SDK under the same mempool.

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const SPK = "20" + "00".repeat(32) + "ac";
const A = { transactionId: "a".repeat(64), index: 0 };
const B = { transactionId: "b".repeat(64), index: 1 };

const node = {
  utxos: [
    { outpoint: A, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: SPK, blockDaaScore: 1000n, isCoinbase: false },
    { outpoint: B, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: SPK, blockDaaScore: 1200n, isCoinbase: false }
  ],
  virtualDaaScore: 1_000_000n,
  /** Mempool transactions sending FROM the sender, as `getMempoolEntriesByAddresses` reports them. */
  sending: [] as Array<{ inputs: Array<{ transactionId: string; index: number }> }>,
  /** A mempool transaction paying TO the sender (must never exclude anything). */
  receiving: [] as Array<{ inputs: Array<{ transactionId: string; index: number }> }>,
  mempoolFails: false,
  mempoolMissing: false
};

function mempoolResponse() {
  const tx = (inputs: Array<{ transactionId: string; index: number }>) => ({
    fee: "1000",
    isOrphan: false,
    transaction: { inputs: inputs.map((i) => ({ previousOutpoint: { transactionId: i.transactionId, index: i.index } })), outputs: [] }
  });
  return { entries: [{ address: FROM, sending: node.sending.map((s) => tx(s.inputs)), receiving: node.receiving.map((r) => tx(r.inputs)) }] };
}

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class ScriptedClient {
    constructor() {
      // A client that cannot ask the mempool question at all (method absent).
      if (node.mempoolMissing) (this as any).getMempoolEntriesByAddresses = undefined;
    }
    async getBlockDagInfo() {
      return { networkId: "simnet", virtualDaaScore: node.virtualDaaScore, virtualParentHashes: ["p"], sink: "s", tipHashes: ["s"] };
    }
    async getUtxosByAddress() {
      return node.utxos.map((u) => ({ ...u }));
    }
    async getMempoolEntriesByAddresses() {
      if (node.mempoolFails) throw new Error("mempool query timed out");
      return mempoolResponse();
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: ScriptedClient };
});

const cliPlan = (config: any, ws: string) =>
  runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws });

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("Wave 2(c) · AUD-19 · pending-spend exclusion with mempool evidence", () => {
  const originalCwd = process.cwd();
  let ws: string;
  let config: any;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2c-"));
    fs.writeFileSync(
      path.join(ws, "hardkas.config.js"),
      `export default {
        defaultNetwork: "simulated",
        networks: {
          simulated: { kind: "simulated" },
          simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" }
        }
      };`
    );
    process.chdir(ws);
    const { loadHardkasConfig } = await import("@hardkas/config");
    ({ config } = await loadHardkasConfig({ workspaceRoot: ws }));
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("derivePendingSpentOutpoints · only SENDING entries of the address exclude; shapes with previousOutpoint/previous_outpoint are read", () => {
    const res = {
      entries: [
        {
          address: FROM,
          sending: [{ transaction: { inputs: [{ previousOutpoint: { transactionId: A.transactionId, index: 0 } }, { previous_outpoint: { transactionId: "c".repeat(64), index: 2 } }] } }],
          receiving: [{ transaction: { inputs: [{ previousOutpoint: { transactionId: B.transactionId, index: 1 } }] } }]
        },
        { address: TO, sending: [{ transaction: { inputs: [{ previousOutpoint: { transactionId: B.transactionId, index: 1 } }] } }], receiving: [] }
      ]
    };
    const out = derivePendingSpentOutpoints(res, FROM);
    expect(Array.from(out.outpoints).sort()).toEqual([`${A.transactionId}:0`, `${"c".repeat(64)}:2`]);
    expect(out.sendingEntries).toBe(1);
  });

  it("T-A19 · with a mempool transaction spending outpoint A, the CLI plan never selects A and records the evidence it filtered against", async () => {
    node.sending = [{ inputs: [A] }];
    node.receiving = [];
    const artifact: any = await cliPlan(config, ws);
    expect(artifact.inputs.map((i: any) => i.outpoint.transactionId)).toEqual([B.transactionId]);
    expect(artifact.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    const evidence = artifact.metadata.pendingSpendEvidence;
    expect(evidence).toMatchObject({
      source: "mempool",
      scope: "observer-local",
      address: FROM,
      observedAtDaaScore: node.virtualDaaScore.toString(),
      sendingEntries: 1,
      excludedOutpoints: [`${A.transactionId}:0`]
    });
    expect(evidence.guarantee).toMatch(/local-orchestration-only/);
    expect(JSON.stringify(evidence).toLowerCase()).not.toMatch(/network guarantee|consensus|no competing spend exists/);
    expect(artifact.metadata.utxoSelection.warnings.join(" ")).toMatch(/1 outpoint\(s\) excluded/);
  });

  it("T-A19 · a mempool transaction merely PAYING the sender excludes nothing", async () => {
    node.sending = [];
    node.receiving = [{ inputs: [A] }];
    const artifact: any = await cliPlan(config, ws);
    expect(artifact.inputs.map((i: any) => i.outpoint.transactionId)).toContain(A.transactionId);
    expect(artifact.metadata.pendingSpendEvidence.excludedOutpoints).toEqual([]);
  });

  it("T-A19 · every spendable outpoint pending ⇒ an explicit PENDING_SPEND_ALL_EXCLUDED, not a generic insufficient-funds", async () => {
    node.sending = [{ inputs: [A] }, { inputs: [B] }];
    node.receiving = [];
    const code = await codeOf(cliPlan(config, ws));
    expect(code).toBe("PENDING_SPEND_ALL_EXCLUDED");
    node.sending = [];
  });

  it("T-A19 · no mempool evidence (RPC failure, or a client that cannot ask) ⇒ no plan, PENDING_SPEND_EVIDENCE_UNAVAILABLE", async () => {
    node.sending = [];
    node.mempoolFails = true;
    expect(await codeOf(cliPlan(config, ws))).toBe("PENDING_SPEND_EVIDENCE_UNAVAILABLE");
    node.mempoolFails = false;
    node.mempoolMissing = true;
    expect(await codeOf(cliPlan(config, ws))).toBe("PENDING_SPEND_EVIDENCE_UNAVAILABLE");
    node.mempoolMissing = false;
    expect(await codeOf(observePendingSpends({} as any, FROM))).toBe("PENDING_SPEND_EVIDENCE_UNAVAILABLE");
  });

  it("T-A19 · the SDK applies the same exclusion and refusal; CLI ≡ SDK under the same mempool", async () => {
    node.sending = [{ inputs: [A] }];
    node.receiving = [];
    const cli: any = await cliPlan(config, ws);

    const sdkWs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2c-sdk-"));
    try {
      const sdk = await Hardkas.create({ cwd: sdkWs, autoBootstrap: true, network: "simulated" });
      const cfg: any = sdk.config.config;
      cfg.defaultNetwork = "simnet";
      cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
      vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => node.utxos.map((u) => ({ ...u })) as any);
      vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [], virtualParentHashes: [], sink: "s" } as any);
      const mempoolSpy = vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockImplementation(async () => {
        if (node.mempoolFails) throw new Error("mempool query timed out");
        return mempoolResponse();
      });
      const from: any = { name: FROM, kind: "external-wallet", network: "simnet", address: FROM };
      const to: any = { name: TO, kind: "external-wallet", network: "simnet", address: TO };

      const sdkPlan: any = await sdk.tx.plan({ from, to, amount: "3", feeRate: 1000n });
      expect(mempoolSpy).toHaveBeenCalled();
      expect(sdkPlan.inputs.map((i: any) => i.outpoint.transactionId)).toEqual([B.transactionId]);
      expect(sdkPlan.metadata.pendingSpendEvidence).toMatchObject({ scope: "observer-local", excludedOutpoints: [`${A.transactionId}:0`], observedAtDaaScore: node.virtualDaaScore.toString() });
      expect(sdkPlan.inputs).toEqual(cli.inputs);
      expect(sdkPlan.estimatedFeeSompi).toBe(cli.estimatedFeeSompi);
      expect(sdkPlan.estimatedMass).toBe(cli.estimatedMass);

      node.mempoolFails = true;
      expect(await codeOf(sdk.tx.plan({ from, to, amount: "3", feeRate: 1000n }))).toBe("PENDING_SPEND_EVIDENCE_UNAVAILABLE");
      node.mempoolFails = false;
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(sdkWs, { recursive: true, force: true });
    }
  });

  it("the simulator records no pending-spend evidence (it has no mempool) and says nothing about one", async () => {
    node.sending = [];
    const sim: any = await runTxPlan({ from: "alice", to: "bob", amount: "10", networkId: "simulated", provider: "simulated", feeRate: "1", config, workspaceRoot: ws });
    expect(sim.metadata.pendingSpendEvidence).toBeUndefined();
    expect(sim.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
  });
});
