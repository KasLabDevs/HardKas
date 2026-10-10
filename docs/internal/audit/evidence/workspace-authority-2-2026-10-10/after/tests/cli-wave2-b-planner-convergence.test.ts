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
//           (re-validation of the selected inputs, bounded retries; since the demo-ready block (E02) the
//           fingerprint before/after is evidence, not a condition — see demo-ready-e02-*.test.ts);
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
  reads: 0,
  utxoReads: 0
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
      node.utxoReads += 1;
      // Every attempt reads the UTXO set twice: to select, then to re-validate the selection.
      // (Keyed on the DAG-read count, as before the demo-ready block, this returned [] on the FIRST read and
      // the case below failed with "No UTXOs found" without ever reaching the re-validation.)
      if (node.dropSelectedOnConfirm && node.utxoReads % 2 === 0) return []; // re-validation read loses the inputs
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
  // WORKSPACE-AUTHORITY-2: opened on the real-node simnet it is meant to plan on (it used to be opened on the simulator
  // and re-pointed by writing `config.defaultNetwork` afterwards — the legacy slot that is no longer an authority).
  fs.mkdirSync(path.join(cwd, ".hardkas"), { recursive: true });
  const sdk = await Hardkas.create({ cwd, autoBootstrap: true, network: "simnet" });
  const cfg: any = sdk.config.config;
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

    // Demo-ready · E02 (re-baselined): a virtual state that moves on every read no longer exhausts
    // the retries. Before the demo-ready block this case asserted UtxoVirtualStateUnstable — the E02 defect that
    // made `tx plan` fail whenever blocks kept arriving (every live network). Planning validity
    // is UTXO-scoped; the moving fingerprints are recorded as evidence.
    node.unstable = true;
    const moving: any = await runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws });
    expect(moving.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(moving.metadata.planningWindow).toMatchObject({ validity: "utxo-scoped", attempts: 1 });
    node.unstable = false;
    // Safety layer: inputs that vanish between the read and the re-validation are never planned.
    node.reads = 0;
    node.utxoReads = 0;
    node.dropSelectedOnConfirm = true;
    await expect(
      runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws })
    ).rejects.toMatchObject({ code: "SELECTED_UTXO_INVALIDATED", attempts: 3 });
    node.dropSelectedOnConfirm = false;
    node.reads = 0;
    node.utxoReads = 0;
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
