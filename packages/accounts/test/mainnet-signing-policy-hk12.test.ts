import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import {
  assertSigningNetworkAllowed,
  buildScriptFunding,
  buildSilverSweep,
  signSilverSpend,
  buildCovenantGenesis,
  buildCovenantTransition,
  KaspaWasmPrivateKeySigner
} from "../src/index.js";

/*
 * HK-12 / CA-TX-05 (counter-audit X3-02-tx.log). @hardkas/core mainnet-policy.ts: "an external signer or a direct call
 * never lift it" (MAINNET_TRANSACTIONS_ENABLED = false). Before: `allowMainnet: true` lifted the guard in the accounts
 * signer, the kaspa-wasm signer and the v1 engine, and buildScriptFunding (reproduced: a mainnet transaction was signed),
 * buildSilverSweep, signSilverSpend and the covenant constructors signed mainnet with no flag at all. Now the constant
 * decides on every signing route of @hardkas/accounts; `allowMainnet` has no effect (deprecated).
 */

const k: any = loadManagedKaspaWasmSync();
const keyHex = () => randomBytes(32).toString("hex");
const codeOf = async (f: () => unknown): Promise<string | undefined> => {
  try {
    await f();
  } catch (e: any) {
    return e?.code ?? String(e?.message ?? e).split(":")[0];
  }
  return undefined;
};

describe("HK-12 / CA-TX-05 · no route of @hardkas/accounts signs on mainnet", () => {
  it("assertSigningNetworkAllowed: allowMainnet: true no longer lifts it", async () => {
    expect(await codeOf(() => assertSigningNetworkAllowed({ network: "mainnet" as any, mode: "real" }))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOf(() => assertSigningNetworkAllowed({ network: "mainnet" as any, mode: "real", allowMainnet: true }))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOf(() => assertSigningNetworkAllowed({ network: "testnet-10" as any, mode: "real", allowMainnet: true }))).toBeUndefined();
  });

  it("buildScriptFunding on mainnet (X3-02 signed one): MAINNET_SIGNING_DISABLED, nothing signed", async () => {
    const key = keyHex();
    const addr = new k.PrivateKey(key).toKeypair().toAddress("mainnet").toString();
    const spk = k.payToAddressScript(addr);
    const code = await codeOf(() =>
      buildScriptFunding({
        utxos: [{ outpoint: { transactionId: randomBytes(32).toString("hex"), index: 0 }, amountSompi: 10n * 100_000_000n, scriptPublicKey: { version: Number(spk.version), script: String(spk.script) }, blockDaaScore: 1n, isCoinbase: false }],
        privateKey: key,
        lockingScript: { version: 0, script: "aa20" + "11".repeat(32) + "87" },
        valueSompi: 100_000_000n,
        networkId: "mainnet"
      })
    );
    expect(code).toBe("MAINNET_SIGNING_DISABLED");
  });

  it("buildSilverSweep, signSilverSpend, buildCovenantGenesis and buildCovenantTransition on mainnet: refused before anything else", async () => {
    expect(await codeOf(() => buildSilverSweep({ networkId: "mainnet" } as any))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOf(() => signSilverSpend({ schema: "hardkas.silver.spendDraft.v1", networkId: "kaspa-mainnet" } as any, keyHex()))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOf(() => buildCovenantGenesis({ networkId: "mainnet" } as any))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOf(() => buildCovenantTransition({ networkId: "mainnet-1" } as any))).toBe("MAINNET_SIGNING_DISABLED");
  });

  it("KaspaWasmPrivateKeySigner({ allowMainnet: true }) refuses a mainnet plan", async () => {
    const key = keyHex();
    const addr = new k.PrivateKey(key).toKeypair().toAddress("mainnet").toString();
    const signer = new KaspaWasmPrivateKeySigner({ account: { name: "m", kind: "kaspa", address: addr, privateKey: key } as any, allowMainnet: true });
    const plan: any = {
      schema: "hardkas.txPlan",
      networkId: "mainnet",
      mode: "real",
      from: { address: addr },
      to: { address: addr },
      amountSompi: "1",
      estimatedFeeSompi: "1000",
      inputs: [],
      outputs: []
    };
    expect(await codeOf(() => (signer as any).signTxPlan({ planArtifact: plan }))).toBe("MAINNET_SIGNING_DISABLED");
  });
});
