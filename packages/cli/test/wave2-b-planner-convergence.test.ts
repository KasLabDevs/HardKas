import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";
import { Hardkas } from "@hardkas/sdk";
import { WalletToolkit } from "@hardkas/toolkit";

// Wave 2(b) · AUD-17 (PLANNER-CONVERGENCE-1) + AUD-28 (CHANGEADDR)
//   T-A17a  the CLI on a real network plans through the upstream Generator and records
//           `plannerAuthority: KASPA_WASM_GENERATOR`; the CLI safety layers stay
//           (fingerprint before/after, confirmation query, bounded retries);
//   T-A17b  the same intention through the CLI and the SDK gives the same inputs, fee and mass;
//   T-A17c  the simulator plans through the canonical synthetic planner, labelled SYNTHETIC_SIMULATOR;
//   T-A28   an explicit change destination reaches the plan through the SDK, the CLI and the toolkit.

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const CHANGE = "kaspasim:qq56zz2ta0s9fmf67j6yw0w87urrtkpx03l4ddh3c2y5ex0jrt60yvcx9ypa6";
const SPK = "20" + "00".repeat(32) + "ac";

/** The node the CLI reads from, scripted; `unstable` flips the virtual fingerprint on every read. */
const node = {
  utxos: [
    { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: SPK, blockDaaScore: 1000n, isCoinbase: false },
    { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: SPK, blockDaaScore: 1200n, isCoinbase: false }
  ],
  virtualDaaScore: 1_000_000n,
  unstable: false,
  dropSelectedOnConfirm: false,
  reads: 0
};

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class ScriptedClient {
    async getBlockDagInfo() {
      node.reads += 1;
      const tick = node.unstable ? node.reads : 0;
      return { networkId: "simnet", virtualDaaScore: node.virtualDaaScore + BigInt(tick), virtualParentHashes: [`p${tick}`], sink: `s${tick}`, tipHashes: [`s${tick}`] };
    }
    async getUtxosByAddress() {
      if (node.dropSelectedOnConfirm && node.reads >= 1 && node.reads % 2 === 1) return []; // confirmation read loses the inputs
      return node.utxos.map((u) => ({ ...u }));
    }
    // Wave 2(c) · AUD-19: the planner requires ONE mempool observation; this node's mempool is empty.
    async getMempoolEntriesByAddresses() {
      return { entries: [] };
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: ScriptedClient };
});

/**
 * An SDK whose default network is a real-node simnet (kind kaspa-node), with the node
 * reads scripted to the same UTXO set the CLI's scripted client serves.
 */
async function realNodeSdk(cwd: string): Promise<Hardkas> {
  const sdk = await Hardkas.create({ cwd, autoBootstrap: true, network: "simulated" });
  const cfg: any = sdk.config.config;
  cfg.defaultNetwork = "simnet";
  cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
  vi.spyOn(sdk.query, "getSpendableUtxos").mockResolvedValue({
    data: node.utxos.map((u) => ({ ...u, amountSompi: u.amountSompi.toString(), blockDaaScore: u.blockDaaScore.toString() }))
  } as any);
  vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [], virtualParentHashes: [], sink: "s" } as any);
  return sdk;
}

describe("Wave 2(b) · canonical planner in the CLI (AUD-17) and explicit change (AUD-28)", () => {
  const originalCwd = process.cwd();
  let ws: string;
  let config: any;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2b-"));
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

  it("T-A17c · the simulator plans through the canonical synthetic planner and says so", async () => {
    const artifact: any = await runTxPlan({ from: "alice", to: "bob", amount: "10", networkId: "simulated", provider: "simulated", feeRate: "1", config, workspaceRoot: ws });
    expect(artifact.mode).toBe("simulator");
    expect(artifact.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
    expect(artifact.plannerAuthorityDetail).toMatch(/simulator/);
    expect(artifact.metadata?.utxoSelection?.selectionStrategy).toBeDefined();
    expect(artifact.rpcUrl).toBe("simulated://local");
  });

  it("T-A17a · a real network plans through the upstream Generator (KASPA_WASM_GENERATOR) with the CLI read guards intact", async () => {
    node.unstable = false;
    node.dropSelectedOnConfirm = false;
    const artifact: any = await runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws });
    expect(artifact.mode).toBe("localnet");
    expect(artifact.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(artifact.plannerAuthorityDetail).toMatch(/@/);
    expect(artifact.metadata?.utxoSelection?.selectionStrategy).toBe("upstream-generator");
    expect(artifact.inputs.length).toBeGreaterThan(0);
    expect(BigInt(artifact.estimatedFeeSompi)).toBeGreaterThan(0n);
    expect(BigInt(artifact.estimatedMass)).toBeGreaterThan(0n);
    expect(artifact.change?.address).toBe(FROM);

    // Safety layer 1: an unstable virtual fingerprint exhausts the retries instead of planning on a moving read.
    node.unstable = true;
    await expect(
      runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws })
    ).rejects.toMatchObject({ name: expect.stringMatching(/UtxoVirtualStateUnstable/) });
    node.unstable = false;
    // Safety layer 2: inputs that vanish between the read and the confirmation query are never planned.
    node.reads = 0;
    node.dropSelectedOnConfirm = true;
    await expect(
      runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws })
    ).rejects.toThrow();
    node.dropSelectedOnConfirm = false;
    node.reads = 0;
  });

  it("T-A17b · the same intention through the CLI and the SDK yields the same inputs, fee and mass", async () => {
    const cli: any = await runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws });

    const sdkWs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2b-sdk-"));
    try {
      const sdk = await realNodeSdk(sdkWs);
      const sdkPlan: any = await sdk.tx.plan({
        from: { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any,
        to: { name: TO, kind: "external-wallet", network: "simnet", address: TO } as any,
        amount: "3",
        feeRate: 1000n
      });
      expect(sdkPlan.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
      expect(cli.inputs).toEqual(sdkPlan.inputs);
      expect(cli.outputs).toEqual(sdkPlan.outputs);
      expect(cli.change).toEqual(sdkPlan.change);
      expect(cli.estimatedFeeSompi).toBe(sdkPlan.estimatedFeeSompi);
      expect(cli.estimatedMass).toBe(sdkPlan.estimatedMass);
      expect(cli.plannerAuthorityDetail).toBe(sdkPlan.plannerAuthorityDetail);
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(sdkWs, { recursive: true, force: true });
    }
  });

  it("T-A28 · an explicit change destination reaches the plan through the CLI (real and simulator), the SDK and the toolkit", async () => {
    const cliReal: any = await runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", changeAddress: CHANGE, config, workspaceRoot: ws });
    expect(cliReal.change?.address).toBe(CHANGE);
    expect(cliReal.outputs[0].address).toBe(TO);

    const cliSim: any = await runTxPlan({ from: "alice", to: "bob", amount: "10", networkId: "simulated", provider: "simulated", feeRate: "1", changeAddress: "carol", config, workspaceRoot: ws });
    const { resolveHardkasAccount } = await import("@hardkas/accounts");
    const carol = resolveHardkasAccount({ nameOrAddress: "carol", config, executionTarget: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } as any });
    expect(cliSim.change?.address).toBe(carol.address);

    const sdkWs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2b-sdk28-"));
    try {
      const sdk = await Hardkas.create({ cwd: sdkWs, autoBootstrap: true, network: "simulated" });
      const carolAcct: any = await sdk.accounts.resolve("carol");
      const simPlan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10", feeRate: 1n, changeAddress: carolAcct.address });
      expect(simPlan.change?.address).toBe(carolAcct.address);
      expect(simPlan.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");

      const realSdkWs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2b-sdk28r-"));
      const realSdk = await realNodeSdk(realSdkWs);
      const realPlan: any = await realSdk.tx.plan({
        from: { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any,
        to: { name: TO, kind: "external-wallet", network: "simnet", address: TO } as any,
        amount: "3",
        feeRate: 1000n,
        changeAddress: CHANGE
      });
      fs.rmSync(realSdkWs, { recursive: true, force: true });
      expect(realPlan.change?.address).toBe(CHANGE);
      expect(realPlan).toMatchObject({ inputs: cliReal.inputs, estimatedFeeSompi: cliReal.estimatedFeeSompi, estimatedMass: cliReal.estimatedMass });
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(sdkWs, { recursive: true, force: true });
    }

    // Toolkit: `planUpstream` (used by send/payMany) forwards changeAddress to the upstream planner.
    const planUpstream = (WalletToolkit.prototype as any).planUpstream as (p: any) => Promise<{ plan: any }>;
    const { plan } = await planUpstream.call({}, {
      fromAddress: FROM,
      availableUtxos: node.utxos,
      outputs: [{ address: TO, amountSompi: 300_000_000n }],
      feeRate: 1000n,
      virtualDaaScore: node.virtualDaaScore,
      networkId: "simnet",
      changeAddress: CHANGE
    });
    expect(plan.change?.address).toBe(CHANGE);
  });
});
