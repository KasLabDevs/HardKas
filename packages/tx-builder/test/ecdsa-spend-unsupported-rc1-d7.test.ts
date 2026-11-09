import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { TxPlanService, kaspaAddressVersion, assertSpendableAddressScheme } from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// RC1 · D7 · the planner does not plan a spend FROM an ECDSA address (P2PK ECDSA, address version 1): HardKAS's signer
// signs Schnorr only, so such a plan could never be signed. Before: the payment and the consolidation were planned
// (the UTXOs read, the mass priced as Schnorr) and the failure came later, untyped, at the signer. Now:
// ECDSA_SPEND_NOT_SUPPORTED before any UTXO is read. Paying TO an ECDSA address is unchanged (V-04, real node).
// The address version is read from the bech32 payload's first byte (no checksum check here: the node does that).
// -----------------------------------------------------------------------------

let schnorr = "";
let ecdsa = "";
let p2sh = "";
let k: any;

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const pub = new k.PrivateKey("3333".padStart(64, "0")).toPublicKey();
  schnorr = String(pub.toAddress("simnet").toString());
  ecdsa = String(pub.toAddressECDSA("simnet").toString());
  p2sh = String(k.addressFromScriptPublicKey(k.payToScriptHashScript(new Uint8Array([0x51])), "simnet").toString());
});

describe("RC1 · D7 · address scheme of a spend", () => {
  it("reads the version byte the way kaspa-wasm encodes it (Schnorr 0, ECDSA 1, P2SH 8), on every prefix", () => {
    expect(kaspaAddressVersion(schnorr)).toBe(0);
    expect(kaspaAddressVersion(ecdsa)).toBe(1);
    expect(kaspaAddressVersion(p2sh)).toBe(8);
    for (const prefix of ["kaspa", "kaspatest", "kaspadev"]) {
      const pub = new k.PrivateKey("4444".padStart(64, "0")).toPublicKey();
      const net = prefix === "kaspa" ? "mainnet" : prefix === "kaspatest" ? "testnet-10" : "devnet";
      expect(kaspaAddressVersion(String(pub.toAddressECDSA(net).toString())), prefix).toBe(1);
      expect(kaspaAddressVersion(String(pub.toAddress(net).toString())), prefix).toBe(0);
    }
    for (const bad of ["", "kaspasim:", "nocolon", "kaspasim:!!", "kaspa:sim_alice"]) expect(kaspaAddressVersion(bad), bad).toBeUndefined();
    expect(() => assertSpendableAddressScheme(schnorr, "the sender")).not.toThrow();
    expect(() => assertSpendableAddressScheme("kaspa:sim_alice", "the sender")).not.toThrow();
    expect(() => assertSpendableAddressScheme(ecdsa, "the sender")).toThrow(/ECDSA_SPEND_NOT_SUPPORTED/);
  });

  it("D7-P1 a payment FROM an ECDSA address: ECDSA_SPEND_NOT_SUPPORTED before any UTXO is read (it used to be planned)", async () => {
    const getUtxos = vi.fn(async () => [
      { outpoint: { transactionId: "d".repeat(64), index: 0 }, address: ecdsa, amountSompi: 500_000_000n, scriptPublicKey: "21" + "02" + "11".repeat(32) + "ab", blockDaaScore: 0n, isCoinbase: false }
    ]);
    const service = new TxPlanService({ getUtxos } as any);
    const err: any = await service.planTransactionUpstream({ fromAddress: ecdsa, toAddress: schnorr, amountSompi: 100_000_000n, networkId: "simnet" }).catch((e) => e);
    expect(err?.code).toBe("ECDSA_SPEND_NOT_SUPPORTED");
    expect(String(err?.message)).toContain(ecdsa);
    expect(getUtxos).not.toHaveBeenCalled();
  });

  it("D7-P2 a consolidation of an ECDSA address's UTXOs: ECDSA_SPEND_NOT_SUPPORTED (by the address and by the scripts)", async () => {
    const service = new TxPlanService({ getUtxos: async () => [] } as any);
    const utxo = { outpoint: { transactionId: "e".repeat(64), index: 0 }, address: ecdsa, amountSompi: 500_000_000n, scriptPublicKey: "21" + "03" + "22".repeat(32) + "ab", blockDaaScore: 0n, isCoinbase: false };
    const byAddress: any = await service.planConsolidation({ fromAddress: ecdsa, selectedUtxos: [utxo], toAddress: schnorr, networkId: "simnet" } as any).catch((e) => e);
    expect(byAddress?.code).toBe("ECDSA_SPEND_NOT_SUPPORTED");
    // a 35-byte P2PK ECDSA script, bare or with its version prefix, whatever address the row names
    for (const scriptPublicKey of [utxo.scriptPublicKey, "0000" + utxo.scriptPublicKey]) {
      const byScript: any = await service
        .planConsolidation({ fromAddress: schnorr, selectedUtxos: [{ ...utxo, address: schnorr, scriptPublicKey }], toAddress: schnorr, networkId: "simnet" } as any)
        .catch((e) => e);
      expect(byScript?.code, scriptPublicKey).toBe("ECDSA_SPEND_NOT_SUPPORTED");
    }
  });

  it("control · paying TO an ECDSA address from a Schnorr one is planned as before", async () => {
    const service = new TxPlanService({
      getUtxos: async () => [{ outpoint: { transactionId: "f".repeat(64), index: 0 }, address: schnorr, amountSompi: 500_000_000n, scriptPublicKey: String(k.payToAddressScript(schnorr).script), blockDaaScore: 0n, isCoinbase: false }]
    } as any);
    const r = await service.planTransactionUpstream({ fromAddress: schnorr, toAddress: ecdsa, amountSompi: 100_000_000n, networkId: "simnet" });
    expect(r.plan.outputs[0]!.address).toBe(ecdsa);
  });
});
