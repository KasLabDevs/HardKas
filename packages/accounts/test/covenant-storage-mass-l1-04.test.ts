import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getSilContract, loadManagedKaspaWasmSync, parseSilArtifactValuesJson, silContractBytecodeHex, silverP2shAddress } from "@hardkas/core";
import { v1StorageMass, calculateUpstreamStorageMass } from "@hardkas/tx-builder";
import { buildCovenantGenesis, buildCovenantTransition } from "../src/silver-covenant.js";

/*
 * L1-04 / SC-03: the legacy covenant constructors committed kaspa-wasm `calculateStorageMass` (amounts only, plurality
 * 1) — the corpus genesis (1e9 sompi) committed 1,083 where the node's Toccata rule (a P2SH output with a covenant id has
 * utxo_plurality 2, mass/mod.rs) gives ~4,083 — and the transition handed kaspa-wasm the UTXO's covenant id under
 * `covenantId`, a key it ignores (it reads `covenant_id`). Fixtures: the silverc v1.0.0 artifacts of the
 * SILVER-GENESIS-TXID-1 suite (no silverc needed).
 */

const FIXTURES = path.join(__dirname, "fixtures", "silver-genesis-txid-1");
const artifact = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.artifact.json`), "utf8"));
const KEY = "4444".padStart(64, "0");
let k: any;
let address = "";
let p2pk: { version: number; script: string };
beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  const own = new k.PrivateKey(KEY).toKeypair().toAddress("simnet");
  address = own.toString();
  const spk = k.payToAddressScript(own);
  p2pk = { version: Number(spk.version), script: String(spk.script) };
});
const lockOf = (art: unknown, name: string) => {
  const a = silverP2shAddress(silContractBytecodeHex(getSilContract(art as any, name).contract), "simnet");
  const spk = k.payToAddressScript(new k.Address(a));
  return { version: Number(spk.version), script: String(spk.script) };
};

describe("L1-04 / SC-03 · committed storage mass by the node's rule", () => {
  it("genesis: the committed storage mass is v1StorageMass with the covenant output's plurality 2 (not the amounts-only value)", () => {
    const value = 1_000_000_000n;
    const funding = { outpoint: { transactionId: "d".repeat(64), index: 0 }, amountSompi: 100_000_000_000n, scriptPublicKey: p2pk, blockDaaScore: 0n, isCoinbase: false };
    const g = buildCovenantGenesis({
      artifact: artifact("counter-covenant-10"),
      contractName: "CounterCovenant",
      valueSompi: value,
      funding: [{ ...funding, privateKey: KEY, computeBudget: 10 }],
      changeAddress: address,
      networkId: "simnet",
      feeSompi: 1_000_000n
    });
    const change = funding.amountSompi - value - 1_000_000n;
    const expected = v1StorageMass(
      [{ amountSompi: funding.amountSompi, scriptBytes: p2pk.script.length / 2, covenantId: false }],
      [
        { amountSompi: value, scriptBytes: g.lockingScript.script.length / 2, covenantId: true },
        { amountSompi: change, scriptBytes: p2pk.script.length / 2, covenantId: false }
      ]
    );
    const amountsOnly = calculateUpstreamStorageMass([funding.amountSompi], [value, change], "simnet");
    expect(g.storageMass).toBe(expected);
    expect(g.storageMass).toBeGreaterThan(BigInt(amountsOnly));
    expect(BigInt(g.transaction.storageMass)).toBe(expected);
  });

  it("transition: the covenant UTXO's id reaches kaspa-wasm (`covenant_id`) and the storage mass counts both covenant cells", () => {
    const current = artifact("counter-covenant-10");
    const successor = artifact("counter-covenant-successor");
    const covenantId = "e".repeat(64);
    const t = buildCovenantTransition({
      current,
      successor,
      contractName: "CounterCovenant",
      policy: "bump",
      args: parseSilArtifactValuesJson(JSON.stringify([{ kind: "int", value: 5 }])),
      utxo: { outpoint: { transactionId: "f".repeat(64), index: 0 }, amountSompi: 1_000_000_000n, scriptPublicKey: lockOf(current, "CounterCovenant"), blockDaaScore: 0n, isCoinbase: false, covenantId },
      networkId: "simnet",
      computeBudget: 0
    });
    // kaspa-wasm serializes the UTXO's covenant id only when it read it (from `covenant_id`; `covenantId` was dropped)
    expect(String(t.transaction.serializeToObject().inputs[0].utxo?.covenantId ?? "")).toBe(covenantId);
    const expected = v1StorageMass(
      [{ amountSompi: 1_000_000_000n, scriptBytes: lockOf(current, "CounterCovenant").script.length / 2, covenantId: true }],
      [{ amountSompi: t.successorSompi, scriptBytes: t.lockingScript.script.length / 2, covenantId: true }]
    );
    expect(t.storageMass).toBe(expected);
  });
});
