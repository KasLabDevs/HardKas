import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, HARDKAS_VERSION, createV1TxPlanArtifact } from "@hardkas/artifacts";
import {
  V1_TX_DRAFT_SCHEMA,
  buildV1WasmTransaction,
  signV1Draft,
  type V1TxDraft
} from "../src/index.js";
import { finalizeSilverSpend } from "../src/silver-spend.js";
import { PrivateKeyAuthorizer, EcdsaPrivateKeyAuthorizer, LazyAccountAuthorizer } from "../src/authorizers.js";
import { KaspaSdkRealTxSigner } from "../src/kaspa-sdk-real-signer.js";
import { signTxPlanArtifact } from "../src/signer.js";

const KEY = "11".repeat(32);
const ctx = {
  ...systemRuntimeContext,
  clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-11-24T00:00:00.000Z") }
} as any;

async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
  } catch (e: any) {
    return e?.code ?? String(e?.message ?? e).split(":")[0];
  }
  return undefined;
}

describe("Priority 1 · Mainnet lockdown across all @hardkas/accounts signing paths before key reads", () => {
  it("signV1Draft refuses mainnet with MAINNET_SIGNING_DISABLED before touching key or signing", () => {
    const k = loadManagedKaspaWasmSync();
    const pk = new k.PrivateKey(KEY);
    const addr = String(pk.toPublicKey().toAddress("mainnet").toString());
    const xonly = String(pk.toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
    const spk = `000020${xonly}ac`;
    const plan = createV1TxPlanArtifact({
      networkId: "mainnet" as any,
      mode: "rpc" as any,
      from: { input: "alice", address: addr },
      to: { input: "alice", address: addr },
      amountSompi: 100_000_000n,
      body: {
        txVersion: 1,
        inputs: [
          {
            outpoint: { transactionId: "aa".repeat(32), index: 0 },
            amountSompi: "200000000",
            address: addr,
            scriptPublicKey: spk,
            kind: "p2pk",
            computeBudget: 10,
            signer: "alice"
          }
        ],
        outputs: [{ address: addr, amountSompi: "199000000", role: "payment" }],
        estimatedFeeSompi: "1000000",
        estimatedMass: "0",
        storageMass: "1",
        maxFeeSompi: "2000000"
      },
      ctx
    });
    const txId = String(buildV1WasmTransaction(k, plan).id);
    const unsignedDraft: Omit<V1TxDraft, "contentHash"> = {
      schema: V1_TX_DRAFT_SCHEMA,
      hardkasVersion: HARDKAS_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "mainnet",
      planArtifactId: plan.contentHash!,
      txId,
      slots: [{ input: 0, kind: "p2pk", signer: "alice", publicKey: xonly }]
    };
    const draft: V1TxDraft = {
      ...unsignedDraft,
      contentHash: calculateContentHash(unsignedDraft as any, CURRENT_HASH_VERSION)
    };

    let keyReads = 0;
    const input: any = {
      draft,
      plan,
      account: "alice",
      get privateKey() {
        keyReads++;
        return KEY;
      }
    };

    let caught: any;
    try {
      signV1Draft(input);
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe("MAINNET_SIGNING_DISABLED");
    expect(keyReads).toBe(0);
  });

  it("finalizeSilverSpend refuses mainnet variants with MAINNET_SIGNING_DISABLED", async () => {
    for (const networkId of ["mainnet", "kaspa-mainnet", "mainnet-1"]) {
      const code = await codeOf(() =>
        finalizeSilverSpend(
          { schema: "hardkas.silver.spendDraft.v1", networkId } as any,
          {} as any,
          [],
          {}
        )
      );
      expect(code, networkId).toBe("MAINNET_SIGNING_DISABLED");
    }
  });

  it("PrivateKeyAuthorizer and EcdsaPrivateKeyAuthorizer refuse mainnet in authorize() before signing", async () => {
    const mainnetPlan: any = {
      schema: "hardkas.txPlan",
      networkId: "mainnet",
      mode: "rpc",
      execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" },
      inputs: [{ outpoint: { transactionId: "aa".repeat(32), index: 0 }, amountSompi: "1000", address: "kaspa:qq" }],
      outputs: []
    };

    const schnorr = new PrivateKeyAuthorizer("alice", KEY);
    expect(
      await codeOf(() => schnorr.authorize({ inputIndex: 0, plan: mainnetPlan, wasmTransaction: {}, wasm: {} }))
    ).toBe("MAINNET_SIGNING_DISABLED");

    const ecdsa = new EcdsaPrivateKeyAuthorizer("alice", KEY);
    expect(
      await codeOf(() => ecdsa.authorize({ inputIndex: 0, plan: mainnetPlan, wasmTransaction: {}, wasm: {} }))
    ).toBe("MAINNET_SIGNING_DISABLED");
  });

  it("LazyAccountAuthorizer refuses mainnet before resolving account or touching env/keystore", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-lazy-mainnet-"));
    try {
      const devDir = path.join(tmp, ".hardkas", "dev-accounts");
      fs.mkdirSync(devDir, { recursive: true });
      fs.writeFileSync(
        path.join(devDir, "mainnetAlice.json"),
        JSON.stringify({
          type: "hardkas.encryptedKeystore.v2",
          metadata: { network: "mainnet", address: "kaspa:qq0000" },
          payload: { address: "kaspa:qq0000" }
        })
      );

      const authorizer = new LazyAccountAuthorizer("mainnetAlice", tmp);
      const mainnetPlan: any = {
        schema: "hardkas.txPlan",
        networkId: "mainnet",
        execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" },
        inputs: [{ outpoint: { transactionId: "aa".repeat(32), index: 0 }, amountSompi: "1000" }],
        outputs: []
      };
      expect(
        await codeOf(() => authorizer.authorize({ inputIndex: 0, plan: mainnetPlan, wasmTransaction: {}, wasm: {} }))
      ).toBe("MAINNET_SIGNING_DISABLED");

      // Even if plan label claims simnet, an account bound to mainnet must refuse before unlocking keystore
      const simnetPlanWithMainnetAccount: any = {
        ...mainnetPlan,
        networkId: "simnet",
        execution: { mode: "rpc", domain: "kaspa-l1", network: "simnet" }
      };
      expect(
        await codeOf(() => authorizer.authorize({ inputIndex: 0, plan: simnetPlanWithMainnetAccount, wasmTransaction: {}, wasm: {} }))
      ).toBe("MAINNET_SIGNING_DISABLED");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("KaspaSdkRealTxSigner.sign refuses mainnet before loading SDK or reading account.privateKey", async () => {
    const sdkLoader = vi.fn(async () => ({}));
    const signer = new KaspaSdkRealTxSigner({ sdkLoader });
    let keyReads = 0;
    const account: any = {
      name: "mainnet_alice",
      address: "kaspa:qq",
      get privateKey() {
        keyReads++;
        return KEY;
      }
    };
    const plan: any = {
      schema: "hardkas.txPlan",
      networkId: "mainnet",
      execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" },
      from: { address: "kaspa:qq" },
      to: { address: "kaspa:qq" },
      amountSompi: "1000",
      inputs: [{ outpoint: { transactionId: "aa".repeat(32), index: 0 }, amountSompi: "2000", address: "kaspa:qq", scriptPublicKey: "script" }],
      outputs: [{ address: "kaspa:qq", amountSompi: "1000" }],
      estimatedMass: "500",
      estimatedFeeSompi: "1000"
    };

    expect(await codeOf(() => signer.sign({ plan, account }))).toBe("MAINNET_SIGNING_DISABLED");
    expect(sdkLoader).not.toHaveBeenCalled();
    expect(keyReads).toBe(0);
  });

  it("signTxPlanArtifact refuses mainnet even on simulator mode plans before issuing synthetic authorization", async () => {
    const base: any = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hardkasVersion: "0.13.0-rc.3",
      createdAt: "2026-11-24T00:00:00.000Z",
      networkId: "mainnet",
      mode: "simulator",
      planId: "plan-sim-mainnet",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      amountSompi: "1000",
      inputs: [],
      outputs: [],
      estimatedMass: "300",
      estimatedFeeSompi: "300",
      execution: { mode: "simulator", domain: "kaspa-l1", network: "mainnet" }
    };
    base.hashVersion = CURRENT_HASH_VERSION;
    base.contentHash = calculateContentHash(base, CURRENT_HASH_VERSION);

    expect(
      await codeOf(() =>
        signTxPlanArtifact({
          target: { mode: "simulator", domain: "kaspa-l1", network: "mainnet" },
          planArtifact: base,
          account: { name: "alice", kind: "synthetic", executionMode: "simulator", address: "kaspa:sim_alice" }
        })
      )
    ).toBe("MAINNET_SIGNING_DISABLED");

    expect(
      await codeOf(() =>
        signTxPlanArtifact({
          target: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
          planArtifact: base,
          account: { name: "alice", kind: "synthetic", executionMode: "simulator", address: "kaspa:sim_alice" }
        })
      )
    ).toBe("MAINNET_SIGNING_DISABLED");
  });
});
