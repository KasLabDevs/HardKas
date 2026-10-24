import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getSilContract, loadManagedKaspaWasmSync, parseSilArtifactValuesJson, silContractBytecodeHex, silverP2shAddress } from "@hardkas/core";
import { buildCovenantGenesis, buildCovenantTransition } from "../src/silver-covenant.js";
import { buildScriptFunding } from "../src/silver-funding.js";
import { buildSilverSweep } from "../src/silver-spend.js";

// -----------------------------------------------------------------------------
// SILVER-GENESIS-TXID-1 (2026-10-22). Found by the audit of the demo D:\prueba\hardkas-demo: buildCovenantGenesis builds
// its v1 transaction, THEN binds the covenant output (populateGenesisCovenants) and sets the storage mass, and declares
// `signed.id`. kaspa-wasm recomputes a transaction's id only on finalize(), so the declared txId was the id of the
// transaction before the covenant binding, not of the one serialized and sent. Since the silver submit became one send
// with an honest outcome (ESCROW-BROADCAST-SAFETY-1), the CLI takes a submission as accepted only when the node's answer
// names the declared txId: every covenant genesis the node accepted would have been reported
// SILVER_SUBMIT_OUTCOME_UNKNOWN and left without a record. Fixed: the builder finalizes the transaction before declaring
// its id. Controls: the transition, the P2SH funding (silver deploy) and the sweep (silver spend) already declared the
// id of what they send. Fixtures: the silverc v1.0.0 artifacts of the demo's contracts (no silverc needed); real pinned
// kaspa-wasm, no network.
// -----------------------------------------------------------------------------

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const repoRoot = path.resolve(__dirname, "../../..");
const FIXTURES = path.join(__dirname, "fixtures", "silver-genesis-txid-1");
const artifact = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.artifact.json`), "utf8"));
const KEY = "3333".padStart(64, "0");
let k: any;
let rpc: {
  officialTxIdOf: (transaction: unknown) => string;
  submitTxIdOf: (transaction: unknown, options?: { expectedTxId?: unknown }) => string | undefined;
  acceptedTxIdOf: (answer: unknown, expectedTxId: string | undefined) => string;
};
let address: string;
let p2pk: { version: number; script: string };

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  rpc = await import(pathToFileURL(path.join(repoRoot, "packages", "kaspa-rpc", "dist", "index.js")).href);
  const own = new k.PrivateKey(KEY).toKeypair().toAddress("simnet");
  address = own.toString();
  const spk = k.payToAddressScript(own);
  p2pk = { version: Number(spk.version), script: String(spk.script) };
});

const lockOf = (art: unknown, name: string) => {
  const address = silverP2shAddress(silContractBytecodeHex(getSilContract(art as any, name).contract), "simnet");
  const spk = k.payToAddressScript(new k.Address(address));
  return { version: Number(spk.version), script: String(spk.script) };
};

const fundingCoin = (n: number) => ({
  outpoint: { transactionId: n.toString(16).padStart(64, "b"), index: 0 },
  amountSompi: 100_000_000_000n,
  scriptPublicKey: p2pk,
  blockDaaScore: 0n,
  isCoinbase: false
});

/** The genesis `hardkas silver covenant genesis --amount 10 --compute-budget 10 --fee 1000000` builds (the demo's step 7). */
const genesisOf = (n: number) =>
  buildCovenantGenesis({
    artifact: artifact("counter-covenant-10"),
    contractName: "CounterCovenant",
    valueSompi: 1_000_000_000n,
    funding: [{ ...fundingCoin(n), privateKey: KEY, computeBudget: 10 }],
    changeAddress: address,
    networkId: "simnet",
    feeSompi: 1_000_000n
  });

/** What a node answers to a submission it accepts: the id of the transaction it received. */
const nodeAnswerFor = (rpcTransaction: unknown) => ({ transactionId: rpc.officialTxIdOf(rpcTransaction) });

describe("SILVER-GENESIS-TXID-1: a covenant genesis declares the id of the transaction it sends", () => {
  it("G-1 the declared txId is the official id of the transaction sent (three funding outpoints)", () => {
    for (const n of [1, 2, 3]) {
      const g = genesisOf(n);
      expect(g.txId).toBe(rpc.officialTxIdOf(g.rpcTransaction));
    }
  });

  it("G-2 the declared txId is the id of the returned transaction once finalized", () => {
    const g = genesisOf(4);
    const declared = g.txId;
    g.transaction.finalize();
    expect(String(g.transaction.id)).toBe(declared);
  });

  it("G-3 the CLI's acceptance rule: a node's answer for the genesis names the declared txId (not SILVER_SUBMIT_OUTCOME_UNKNOWN)", () => {
    const g = genesisOf(5);
    expect(rpc.acceptedTxIdOf(nodeAnswerFor(g.rpcTransaction), g.txId)).toBe(g.txId);
  });

  it("G-4 EXPECTED-TXID-1's check before sending accepts the declared txId", () => {
    const g = genesisOf(6);
    expect(rpc.submitTxIdOf(g.rpcTransaction, { expectedTxId: g.txId })).toBe(g.txId);
  });

  it("G-5 control: the covenant binding of the genesis is on output 0 and carries the declared covenant id", () => {
    const g = genesisOf(7);
    expect(g.covenantId).toMatch(/^[0-9a-f]{64}$/);
    expect(String(g.transaction.outputs[0].covenant.covenantId)).toBe(g.covenantId);
    expect(BigInt(g.transaction.outputs[0].value)).toBe(1_000_000_000n);
  });
});

describe("SILVER-GENESIS-TXID-1 controls: the other silver builders declare the id of what they send", () => {
  it("C-1 covenant transition (silver covenant transition --policy bump --compute-budget 0)", () => {
    const g = genesisOf(8);
    const current = artifact("counter-covenant-10");
    const t = buildCovenantTransition({
      current,
      successor: artifact("counter-covenant-successor"),
      contractName: "CounterCovenant",
      policy: "bump",
      args: parseSilArtifactValuesJson(JSON.stringify([{ kind: "int", value: 5 }])),
      utxo: {
        outpoint: { transactionId: "c".repeat(64), index: 0 },
        amountSompi: 1_000_000_000n,
        scriptPublicKey: lockOf(current, "CounterCovenant"),
        blockDaaScore: 0n,
        isCoinbase: false,
        covenantId: g.covenantId
      },
      networkId: "simnet",
      computeBudget: 0
    });
    expect(t.txId).toBe(rpc.officialTxIdOf(t.rpcTransaction));
  });

  it("C-2 P2SH funding (silver deploy)", () => {
    const f = buildScriptFunding({
      utxos: [fundingCoin(9)],
      privateKey: KEY,
      lockingScript: lockOf(artifact("vault-release"), "VaultRelease"),
      valueSompi: 200_000_000n,
      networkId: "simnet"
    });
    expect(f.txId).toBe(rpc.officialTxIdOf(f.rpcTransaction));
  });

  it("C-3 P2SH sweep (silver spend --entry release)", () => {
    const vault = artifact("vault-release");
    const s = buildSilverSweep({
      artifact: vault,
      contractName: "VaultRelease",
      entry: "release",
      args: [{ kind: "signature", privateKey: KEY }],
      utxo: {
        outpoint: { transactionId: "d".repeat(64), index: 0 },
        amountSompi: 200_000_000n,
        scriptPublicKey: lockOf(vault, "VaultRelease"),
        blockDaaScore: 0n,
        isCoinbase: false
      },
      to: address,
      networkId: "simnet"
    });
    expect(s.txId).toBe(rpc.officialTxIdOf(s.rpcTransaction));
  });
});
