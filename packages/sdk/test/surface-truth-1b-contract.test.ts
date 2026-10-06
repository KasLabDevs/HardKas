import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex, parseSignedTransactionPayload } from "@hardkas/artifacts";
import { TxPlanService } from "@hardkas/tx-builder";
import { getOrCreateDevAccount } from "@hardkas/accounts";
import { Hardkas, createHardkasCapabilities } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// SURFACE-TRUTH-1B · the contract the fix settles for the two SDK items of the 1A/1B frontier (the BEFORE file only
// requires that the answers agree and that v1 is not refused as "runtime too old"):
// - capabilities: one authority. `covenants.isSupported()`, `checkCapabilities().fullyOperational` and
//   `capabilities.get().capabilities.covenants` are one answer, derived from the checks `hardkas silver doctor` reports;
//   a node that did not prove its identity is never reported as Toccata- or covenant-capable;
// - `tx.sign` with a v1 plan: decided by the runtime that signs it. The managed kaspa-wasm signs it (a real v1
//   transaction), the simulator refuses it with a typed code instead of dropping the v1 fields.

describe("SURFACE-TRUTH-1B · contract · SDK capabilities and v1 signing", () => {
  let parent: string;

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1b-sdk-"));
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  const workspace = (name: string) => {
    const dir = path.join(parent, name);
    fs.mkdirSync(path.join(dir, ".hardkas"), { recursive: true });
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    return dir;
  };

  it("covenants: isSupported, checkCapabilities and capabilities.get() are one answer; no unobserved node is covenant-capable", async () => {
    const sdk = await Hardkas.open({ cwd: workspace("caps"), network: "simulated", autoBootstrap: true });
    const caps = await sdk.capabilities.get();
    const check = await sdk.covenants.checkCapabilities();
    const readiness = await sdk.capabilities.silverReadiness();

    expect({ isSupported: await sdk.covenants.isSupported(), fullyOperational: check.fullyOperational }).toEqual({
      isSupported: caps.capabilities.covenants,
      fullyOperational: caps.capabilities.covenants
    });
    // the derivation, entry by entry, from the checks `hardkas silver doctor` reports
    expect(caps.capabilities.silverScript).toBe(readiness.ready["silver.compile.v1"]);
    expect(caps.capabilities.covenants).toBe(readiness.ready["toccata.covenant.auth-1to1-transition.v1"]);
    expect(caps.runtimeMatrix!.node.toccata).toBe(readiness.node.ok);
    if (!readiness.node.ok) {
      expect(caps.runtimeMatrix!.node).toEqual({ version: "unknown", toccata: false, txV1: false, covenants: false });
      expect(caps.capabilities.covenants).toBe(false);
      expect(check.nodeSupportsCovenants).toBe(false);
      expect(check.status).not.toBe("READY");
      expect(caps.reasons?.covenants).toMatch(/canonical node did not prove its identity/);
    }
    // L2 is a Lab, not the L1 core
    expect({ l2Profiles: caps.capabilities.l2Profiles, l2BridgeAssumptions: caps.capabilities.l2BridgeAssumptions }).toEqual({
      l2Profiles: false,
      l2BridgeAssumptions: false
    });
    // the concrete covenant surface: the real builders (CLI), and the SDK planning that is not supported, whatever the
    // environment says about the builders
    expect(caps.capabilities.sdkCovenantPlanning).toBe(false);
    expect(caps.scopes?.covenants).toMatch(/1:1 auth-bound/);
    await expect(sdk.covenants.planDeploy({ script: "51", from: "alice", amount: 1n } as any)).rejects.toMatchObject({ code: "COVENANT_PLAN_UNSUPPORTED" });
  });

  it("createHardkasCapabilities() probes nothing and says so for the entries that depend on the environment", () => {
    const caps = createHardkasCapabilities();
    expect({ silverScript: caps.capabilities.silverScript, covenants: caps.capabilities.covenants, transactionV1: caps.capabilities.transactionV1 }).toEqual({
      silverScript: false,
      covenants: false,
      transactionV1: false
    });
    expect(Object.keys(caps.reasons ?? {}).sort()).toEqual(["covenants", "silverScript", "transactionV1"]);
    expect(caps.runtimeMatrix).toBeUndefined();
  });

  it("tx.sign signs a v1 plan for a node network with the managed runtime: a real version-1 transaction", async () => {
    const dir = workspace("v1-node");
    const sdk = await Hardkas.open({ cwd: dir, network: "simnet" });
    const env = await sdk.capabilities.probeEnvironment();
    // the deterministic simnet dev identities (real keys), unlocked explicitly: no silent unlock
    const alice = await getOrCreateDevAccount(dir, 0, "alice");
    const bob = await getOrCreateDevAccount(dir, 1, "bob");
    // A v1 payment planned by the real planner (the pinned Generator: mass, fee, change) over one UTXO of alice's; no
    // node is involved: signing is local.
    const utxo = {
      outpoint: { transactionId: "a".repeat(64), index: 0 },
      address: alice.address,
      amountSompi: 500_000_000n,
      scriptPublicKey: expectedScriptPublicKeyHex(alice.address)!,
      blockDaaScore: 0n,
      isCoinbase: false
    };
    const planned = await new TxPlanService({ getUtxos: async () => [utxo] }).planTransactionUpstream({
      fromAddress: alice.address,
      toAddress: bob.address,
      amountSompi: 100_000_000n,
      networkId: "simnet",
      version: 1
    });
    const plan = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "localnet",
      from: { input: "alice", address: alice.address, accountName: "alice" },
      to: { input: "bob", address: bob.address },
      amountSompi: 100_000_000n,
      plan: planned.plan
    } as any);
    expect((plan as any).txVersion).toBe(1);

    let signed: any;
    let error: any;
    try {
      signed = await sdk.tx.sign(plan as any, {
        account: { kind: "kaspa", name: "alice", network: "simnet", address: alice.address, privateKey: alice.privateKey } as any
      });
    } catch (e) {
      error = e;
    }
    if (!env.kaspa.signingV1) {
      // a runtime that really cannot sign v1 says so, with its version (never "Upgrade to WASM v2.x")
      expect({ code: error?.code, message: String(error?.message) }).toMatchObject({ code: "BLOCKED_BY_DEPENDENCY", message: expect.stringMatching(/does not sign transaction v1/) });
      return;
    }
    expect(error, String(error?.message)).toBeUndefined();
    const parsed = parseSignedTransactionPayload(signed.signedTransaction.payload);
    expect(parsed.ok).toBe(true);
    let tx: any = JSON.parse(signed.signedTransaction.payload);
    while (typeof tx === "string") tx = JSON.parse(tx);
    tx = tx?.outputs ? tx : tx?.tx?.inner ?? tx?.inner ?? tx?.transaction;
    expect({ version: Number(tx.version), inputs: tx.inputs.length }).toEqual({ version: 1, inputs: 1 });
  });

  it("the Igra probe returns the URL and its error without credentials (the URL secret boundary)", async () => {
    const sdk = await Hardkas.open({ cwd: workspace("igra"), network: "simulated", autoBootstrap: true });
    const env = await sdk.capabilities.probeEnvironment({ refresh: true, igraRpcUrl: "http://dev:s3cret-pass@127.0.0.1:1/rpc?token=t0ken-value" });
    const shown = JSON.stringify(env.igra);
    expect({ available: env.igra.available, password: shown.includes("s3cret-pass"), token: shown.includes("t0ken-value") }).toEqual({
      available: false,
      password: false,
      token: false
    });
  });

  it("L2 operations refuse with L2_NOT_IN_CORE (no CLI to send anyone to)", async () => {
    const sdk = await Hardkas.open({ cwd: workspace("l2"), network: "simulated", autoBootstrap: true });
    const codes: Array<string | null> = [];
    for (const op of [() => sdk.l2.tx(), () => sdk.l2.contract(), () => sdk.l2.bridge()]) {
      try {
        await op();
        codes.push(null);
      } catch (e: any) {
        codes.push(e?.code ?? null);
        expect(String(e?.message)).not.toMatch(/Use CLI/i);
      }
    }
    expect(codes).toEqual(["L2_NOT_IN_CORE", "L2_NOT_IN_CORE", "L2_NOT_IN_CORE"]);
  });

  it("tx.sign refuses a v1 plan in the simulator with TX_V1_SIMULATION_UNSUPPORTED (it does not model v1)", async () => {
    const sdk = await Hardkas.open({ cwd: workspace("v1-sim"), network: "simulated", autoBootstrap: true });
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    let error: any;
    try {
      await sdk.tx.sign({ ...plan, txVersion: 1 });
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe("TX_V1_SIMULATION_UNSUPPORTED");
  });
});
