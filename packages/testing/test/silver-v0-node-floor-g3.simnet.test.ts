import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  silverSigFromInputSignature,
  silverUnlockScript,
  type SilAbiArtifact
} from "@hardkas/core";
import { calculateUpstreamStorageMass, v1FeeMass, v1MinimumRelayFee, v1NonContextualMasses, v1StorageMass } from "@hardkas/tx-builder";
import { buildCovenantGenesis, buildScriptFunding, buildSilverSweep, finalizeSilverSpend, parseWasmTxToRpc, prepareSilverSpend, signSilverSpend } from "@hardkas/accounts";
import { getHardkasFixtureKey } from "../src/fixture-signer.js";
import {
  fundTestAccount,
  mineBlocks,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  waitForUtxo,
  type IsolatedSimnetSession,
  type SimnetOnChainUtxo
} from "../src/isolated-simnet.js";

/*
 * G3 (NOTES-CROSSCHECK, 2026-11-13) · v0 transactions whose storage mass (KIP-9) is above the wallet's standard
 * 100,000 g, on a real rusty-kaspad v2.1.0 (simnet).
 *
 * The v0 SilverScript builders priced their minimum fee on kaspa-wasm's calculateTransactionMass/Fee, which is
 * max(compute, storage) × 100 sompi/g, and refused above 100,000 g on that same figure. HK-09 showed, for a P2PK payment
 * with storage mass 50,000 g, that the node's floor is 100 sompi/g of max(compute, normalized transient) only. Here:
 *
 * A (raw transactions, kaspa-wasm only; independent of the builders):
 *   A1 a P2PK v0 funding of a P2SH output whose storage mass is ~125,000 g: one sompi under the node's compute floor is
 *      refused, the floor itself (60× under the storage-inclusive figure) is accepted and mined;
 *   A2 a v0 P2SH spend (a two-signature SilverScript contract, sigOpCount 2) into two outputs with storage mass
 *      ~396,000 g: storage mass above the block limit (500,000 g) refused, floor - 1 refused, the floor accepted and mined.
 * B (the product builders, after the repair): buildScriptFunding, prepareSilverSpend + finalizeSilverSpend and
 *   buildSilverSweep build the same classes at the node's floor, and the node accepts and mines each; B4 a v1 covenant
 *   genesis (buildCovenantGenesis) at the v1 floor it now checks an explicit fee against.
 */

const ARTIFACT = path.resolve(__dirname, "../../accounts/test/fixtures/v1-engine/phase2/twooftwo.artifact.json");
// twooftwo.sil, compiled by the pinned silverc with the pubkeys of the keys 0x11…11 and 0x22…22 (fixtures README)
const KEY_A = "11".repeat(32);
const KEY_B = "22".repeat(32);
const KAS = 100_000_000n;
const ZERO_SUBNET = "0000000000000000000000000000000000000000";
const STANDARD = 100_000n;
const BLOCK_STORAGE = 500_000n;

let k: any;
let session: IsolatedSimnetSession;
let alice: { key: string; address: string; spk: { version: number; script: string } };
let artifact: SilAbiArtifact;
let bytecode: string;
let lock: { version: number; script: string };
let p2shAddress: string;
let coin: SimnetOnChainUtxo;
const evidence: Record<string, unknown>[] = [];

type Submitted = { accepted: boolean; reason: string; txId?: string };
const submit = async (rpcTx: unknown): Promise<Submitted> => {
  try {
    const res: any = await session.rpc.submitTransaction(rpcTx as any, { allowOrphan: false });
    return { accepted: res?.accepted !== false, reason: String(res?.error ?? ""), ...(res?.transactionId ? { txId: String(res.transactionId) } : {}) };
  } catch (e: any) {
    return { accepted: false, reason: String(e?.message ?? e) };
  }
};

/** The node's relay floor of a v0 shape (tx-builder's node formula, certified for v0 P2PK by HK-09). */
const nodeFloor = (inputs: { signatureScriptBytes: number; sigOpCount: number }[], outputScriptBytes: number[]) =>
  v1MinimumRelayFee(
    v1FeeMass(
      v1NonContextualMasses({ version: 0, inputs, outputs: outputScriptBytes.map((scriptBytes) => ({ scriptBytes, covenant: false })), payloadBytes: 0 })
    )
  );
/** The node's storage mass (KIP-9 with the Toccata plurality; plurality 1 for every standard v0 cell here). */
const storageOf = (inputs: { amount: bigint; script: string }[], outputs: { amount: bigint; script: string }[]) =>
  v1StorageMass(
    inputs.map((i) => ({ amountSompi: i.amount, scriptBytes: i.script.length / 2, covenantId: false })),
    outputs.map((o) => ({ amountSompi: o.amount, scriptBytes: o.script.length / 2, covenantId: false }))
  )!;

type Out = { value: bigint; spk: { version: number; script: string } };
const wasmTx = (input: { utxo: SimnetOnChainUtxo; signatureScript: string; sigOpCount: number }, outputs: Out[]) => {
  const { utxo } = input;
  const tx = new k.Transaction({
    version: 0,
    inputs: [
      {
        previousOutpoint: utxo.outpoint,
        signatureScript: input.signatureScript,
        sequence: 0n,
        sigOpCount: input.sigOpCount,
        utxo: {
          outpoint: utxo.outpoint,
          amount: utxo.amountSompi,
          scriptPublicKey: new k.ScriptPublicKey(utxo.scriptPublicKey.version, utxo.scriptPublicKey.script),
          blockDaaScore: utxo.blockDaaScore,
          isCoinbase: utxo.isCoinbase
        }
      }
    ],
    outputs: outputs.map((o) => ({ value: o.value, scriptPublicKey: new k.ScriptPublicKey(o.spk.version, o.spk.script) })),
    lockTime: 0n,
    subnetworkId: ZERO_SUBNET,
    gas: 0n,
    payload: ""
  });
  tx.storageMass = calculateUpstreamStorageMass([utxo.amountSompi], outputs.map((o) => o.value), "simnet");
  tx.finalize();
  return tx;
};

/** alice's P2PK coin, signed by kaspa-wasm. */
const p2pkSpend = (utxo: SimnetOnChainUtxo, outputs: Out[]) => {
  const unsigned = wasmTx({ utxo, signatureScript: "", sigOpCount: 1 }, outputs);
  return wasmTx({ utxo, signatureScript: String(k.createInputSignature(unsigned, 0, new k.PrivateKey(alice.key), k.SighashType.All)), sigOpCount: 1 }, outputs);
};

const unlockWith = (sa: Uint8Array, sb: Uint8Array) =>
  silverUnlockScript(bytecode, encodeSilverEntryArgs({ artifact, contractName: "TwoOfTwo", entry: "spend", args: [{ kind: "bytes", value: sa }, { kind: "bytes", value: sb }] }));

/** The TwoOfTwo P2SH coin spent through `spend(sa, sb)`, both signatures by kaspa-wasm (SIGHASH_ALL). */
const p2shSpend = (utxo: SimnetOnChainUtxo, outputs: Out[]) => {
  const unsigned = wasmTx({ utxo, signatureScript: "", sigOpCount: 2 }, outputs);
  const sig = (key: string) => silverSigFromInputSignature(String(k.createInputSignature(unsigned, 0, new k.PrivateKey(key), k.SighashType.All)));
  return wasmTx({ utxo, signatureScript: unlockWith(sig(KEY_A), sig(KEY_B)), sigOpCount: 2 }, outputs);
};

const rpcOf = (tx: any) => parseWasmTxToRpc(tx.serializeToObject());
const confirmAt = async (address: string, txId: string, index: number) => {
  await mineBlocks(session, 1);
  return waitForUtxo(session, address, { transactionId: String(txId).toLowerCase(), index });
};

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  const key = getHardkasFixtureKey("alice");
  const address = String(new k.PrivateKey(key).toPublicKey().toAddress("simnet").toString());
  const s = k.payToAddressScript(new k.Address(address));
  alice = { key, address, spk: { version: Number(s.version), script: String(s.script) } };
  artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
  bytecode = silContractBytecodeHex(getSilContract(artifact, "TwoOfTwo").contract);
  lock = silverP2shLock(bytecode);
  p2shAddress = silverP2shAddress(bytecode, "simnet");
  coin = await fundTestAccount(session, "alice", 10n * KAS);
});

afterAll(async () => {
  console.log(`[G3] evidence ${JSON.stringify(evidence, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  if (session) await stopIsolatedSimnet(session);
});

describe("G3 · A · v0 transactions above 100,000 g of storage mass, at the node's compute floor (raw kaspa-wasm)", () => {
  let fundedP2sh: SimnetOnChainUtxo;
  let change: SimnetOnChainUtxo;

  it("A1 P2PK → P2SH 0.08 KAS + change: storage ~125,000 g; floor - 1 refused, the floor accepted and mined", async () => {
    const VALUE = 8_000_000n;
    const floor = nodeFloor([{ signatureScriptBytes: 66, sigOpCount: 1 }], [lock.script.length / 2, alice.spk.script.length / 2]);
    const outs = (fee: bigint): Out[] => [
      { value: VALUE, spk: lock },
      { value: coin.amountSompi - VALUE - fee, spk: alice.spk }
    ];
    const storage = storageOf([{ amount: coin.amountSompi, script: coin.scriptPublicKey.script }], outs(floor).map((o) => ({ amount: o.value, script: o.spk.script })));
    expect(storage).toBeGreaterThan(STANDARD);
    expect(storage).toBeLessThanOrEqual(BLOCK_STORAGE);
    expect(storage * 100n).toBeGreaterThan(floor * 10n);

    const under = await submit(rpcOf(p2pkSpend(coin, outs(floor - 1n))));
    expect(under.accepted, under.reason).toBe(false);
    expect(under.reason).toMatch(/under the required amount|fee/i);

    const tx = p2pkSpend(coin, outs(floor));
    const ok = await submit(rpcOf(tx));
    evidence.push({ case: "A1", floor, storage, storageInclusiveFee: storage * 100n, under: under.reason.slice(0, 200), accepted: ok.accepted, reason: ok.reason });
    expect(ok.accepted, ok.reason).toBe(true);
    fundedP2sh = await confirmAt(p2shAddress, String(tx.id), 0);
    change = await waitForUtxo(session, alice.address, { transactionId: String(tx.id).toLowerCase(), index: 1 });
    expect(fundedP2sh.amountSompi).toBe(VALUE);
  });

  it("A2 the P2SH (two signatures, sigOpCount 2) into two outputs, storage ~396,000 g: over 500,000 refused, floor - 1 refused, the floor accepted and mined", async () => {
    expect(fundedP2sh, "A1 funded the P2SH output").toBeDefined();
    const placeholder = unlockWith(new Uint8Array(65), new Uint8Array(65));
    const floor = nodeFloor([{ signatureScriptBytes: placeholder.length / 2, sigOpCount: 2 }], [alice.spk.script.length / 2, alice.spk.script.length / 2]);
    const IN = fundedP2sh.amountSompi;
    const split = (fee: bigint, first: bigint | undefined = undefined): Out[] => {
      const total = IN - fee;
      const a = first ?? total / 2n;
      return [
        { value: a, spk: alice.spk },
        { value: total - a, spk: alice.spk }
      ];
    };
    const cells = (outs: Out[]) => outs.map((o) => ({ amount: o.value, script: o.spk.script }));
    const over = split(floor, 1_500_000n);
    const overStorage = storageOf([{ amount: IN, script: lock.script }], cells(over));
    expect(overStorage).toBeGreaterThan(BLOCK_STORAGE);
    const tooBig = await submit(rpcOf(p2shSpend(fundedP2sh, over)));
    expect(tooBig.accepted, tooBig.reason).toBe(false);

    const under = await submit(rpcOf(p2shSpend(fundedP2sh, split(floor - 1n))));
    expect(under.accepted, under.reason).toBe(false);
    expect(under.reason).toMatch(/under the required amount|fee/i);

    const good = split(floor);
    const storage = storageOf([{ amount: IN, script: lock.script }], cells(good));
    expect(storage).toBeGreaterThan(STANDARD);
    expect(storage).toBeLessThanOrEqual(BLOCK_STORAGE);
    const tx = p2shSpend(fundedP2sh, good);
    const ok = await submit(rpcOf(tx));
    evidence.push({
      case: "A2",
      floor,
      storage,
      storageInclusiveFee: storage * 100n,
      overStorage,
      over: tooBig.reason.slice(0, 200),
      under: under.reason.slice(0, 200),
      accepted: ok.accepted,
      reason: ok.reason
    });
    expect(ok.accepted, ok.reason).toBe(true);
    const out = await confirmAt(alice.address, String(tx.id), 0);
    expect(out.amountSompi).toBe(good[0]!.value);
  });

  describe("G3 · B · the product builders build the same classes at the node's floor", () => {
    let b1: SimnetOnChainUtxo;
    let b1Change: SimnetOnChainUtxo;
    let b3Change: SimnetOnChainUtxo;

    it("B1 buildScriptFunding: a 0.08 KAS P2SH funding (storage ~125,000 g) at the node's floor, accepted and mined", async () => {
      expect(change, "A1 left alice a change output").toBeDefined();
      const built = buildScriptFunding({ utxos: [change], privateKey: alice.key, lockingScript: lock, valueSompi: 8_000_000n, networkId: "simnet" });
      const floor = nodeFloor([{ signatureScriptBytes: 66, sigOpCount: 1 }], [lock.script.length / 2, alice.spk.script.length / 2]);
      expect(built.feeSompi).toBe(floor);
      const ok = await submit(built.rpcTransaction);
      evidence.push({ case: "B1", feeSompi: built.feeSompi, accepted: ok.accepted, reason: ok.reason });
      expect(ok.accepted, ok.reason).toBe(true);
      b1 = await confirmAt(p2shAddress, built.txId, 0);
      b1Change = await waitForUtxo(session, alice.address, { transactionId: built.txId.toLowerCase(), index: 1 });
    });

    it("B2 prepareSilverSpend + finalizeSilverSpend: two outputs, storage ~396,000 g, the fee at the node's floor (floor - 1 refused by the builder); accepted and mined", async () => {
      expect(b1, "B1 funded the P2SH output").toBeDefined();
      const placeholder = unlockWith(new Uint8Array(65), new Uint8Array(65));
      const floor = nodeFloor([{ signatureScriptBytes: placeholder.length / 2, sigOpCount: 2 }], [alice.spk.script.length / 2, alice.spk.script.length / 2]);
      const half = (b1.amountSompi - floor) / 2n;
      const outputs = (fee: bigint) => [
        { amountSompi: half, address: alice.address },
        { amountSompi: b1.amountSompi - fee - half, address: alice.address }
      ];
      const args = [{ kind: "signer" as const, signer: "a" }, { kind: "signer" as const, signer: "b" }];
      const request = { artifact, contractName: "TwoOfTwo", entry: "spend", args, utxo: b1, networkId: "simnet" };
      expect(() => prepareSilverSpend({ ...request, outputs: outputs(floor - 1n) })).toThrow(expect.objectContaining({ code: "FEE_BELOW_NETWORK_MINIMUM" }));
      const draft = prepareSilverSpend({ ...request, outputs: outputs(floor) });
      expect(BigInt(draft.feeSompi)).toBe(floor);
      expect(draft.input.sigOpCount).toBe(2);
      const done = finalizeSilverSpend(draft, artifact, args, { a: signSilverSpend(draft, KEY_A), b: signSilverSpend(draft, KEY_B) });
      const ok = await submit(done.rpcTransaction);
      evidence.push({ case: "B2", feeSompi: draft.feeSompi, sdkMass: draft.mass, storageMass: draft.storageMass, accepted: ok.accepted, reason: ok.reason });
      expect(ok.accepted, ok.reason).toBe(true);
      await confirmAt(alice.address, done.txId, 0);
    });

    it("B3 buildScriptFunding 0.025 KAS (storage ~400,000 g), then buildSilverSweep of it (storage ~50,000 g, storage-inclusive fee 2× the coin): both at the node's floor, accepted and mined", async () => {
      expect(b1Change, "B1 left alice a change output").toBeDefined();
      const funding = buildScriptFunding({ utxos: [b1Change], privateKey: alice.key, lockingScript: lock, valueSompi: 2_500_000n, networkId: "simnet" });
      const fundOk = await submit(funding.rpcTransaction);
      expect(fundOk.accepted, fundOk.reason).toBe(true);
      const small = await confirmAt(p2shAddress, funding.txId, 0);
      b3Change = await waitForUtxo(session, alice.address, { transactionId: funding.txId.toLowerCase(), index: 1 });

      const sweep = buildSilverSweep({
        artifact,
        contractName: "TwoOfTwo",
        entry: "spend",
        args: [{ kind: "signature", privateKey: KEY_A }, { kind: "signature", privateKey: KEY_B }],
        utxo: small,
        to: alice.address,
        networkId: "simnet",
        sigOpCount: 2
      });
      const floor = nodeFloor([{ signatureScriptBytes: sweep.signatureScriptHex.length / 2, sigOpCount: 2 }], [alice.spk.script.length / 2]);
      expect(sweep.feeSompi).toBe(floor);
      const storage = storageOf([{ amount: small.amountSompi, script: lock.script }], [{ amount: sweep.outputSompi, script: alice.spk.script }]);
      expect(storage * 100n).toBeGreaterThan(small.amountSompi);
      const ok = await submit(sweep.rpcTransaction);
      evidence.push({ case: "B3", fundingFee: funding.feeSompi, sweepFee: sweep.feeSompi, sweepStorage: storage, accepted: ok.accepted, reason: ok.reason });
      expect(ok.accepted, ok.reason).toBe(true);
      const out = await confirmAt(alice.address, sweep.txId, 0);
      expect(out.amountSompi).toBe(sweep.outputSompi);
    });

    it("B4 buildCovenantGenesis (v1, compute budget 10, explicit fee at the node's v1 floor, the v1 engine's rule, which the builder now checks against): accepted and mined", async () => {
      expect(b3Change, "B3 left alice a change output").toBeDefined();
      const counter = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../accounts/test/fixtures/silver-genesis-txid-1/counter-covenant-10.artifact.json"), "utf8"));
      const floor = v1MinimumRelayFee(
        v1FeeMass(
          v1NonContextualMasses({
            version: 1,
            inputs: [{ signatureScriptBytes: 66, computeBudget: 10 }],
            outputs: [{ scriptBytes: 35, covenant: true }, { scriptBytes: alice.spk.script.length / 2, covenant: false }],
            payloadBytes: 0
          })
        )
      );
      const request = {
        artifact: counter,
        contractName: "CounterCovenant",
        valueSompi: 10n * KAS,
        funding: [{ ...b3Change, privateKey: alice.key, computeBudget: 10 }],
        changeAddress: alice.address,
        networkId: "simnet"
      };
      expect(() => buildCovenantGenesis({ ...request, feeSompi: floor - 1n })).toThrow(expect.objectContaining({ code: "FEE_BELOW_NETWORK_MINIMUM" }));
      const g = buildCovenantGenesis({ ...request, feeSompi: floor });
      expect(g.feeSompi).toBe(floor);
      const ok = await submit(g.rpcTransaction);
      evidence.push({ case: "B4", feeSompi: g.feeSompi, storageMass: g.storageMass, accepted: ok.accepted, reason: ok.reason });
      expect(ok.accepted, ok.reason).toBe(true);
      const { contract } = getSilContract(counter, "CounterCovenant");
      const out = await confirmAt(silverP2shAddress(silContractBytecodeHex(contract), "simnet"), g.txId, 0);
      expect(out.covenantId).toBe(g.covenantId.toLowerCase());
    });
  });
});
