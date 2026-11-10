import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { loadManagedKaspaWasmSync, kaspaCovenantId } from "@hardkas/core";
import { v1StorageMass } from "@hardkas/tx-builder";
import { startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "@hardkas/testing";
import { schnorr, secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { validateTransactionScripts } from "../src/ledger/script-engine.js";
import { calcKaspaSchnorrSignatureHash, type KaspaSighashTransaction } from "../src/crypto/kaspa-sighash.js";
import type { KaspaRpcTransaction, SimulatorUtxo } from "../src/types.js";
import { KEYS, REDEEM, SELECTOR, U64_MAX, ZERO_HASH, pushData, pushI64, p2pkScript, p2shScript, loadSilverTemplates, type VectorKey } from "./helpers/consensus-vectors.js";

/*
 * Consensus parity of the simulator against a real rusty-kaspad v2.1.0 simnet node (simnet level: needs Docker; it FAILS,
 * never skips, when no node can be started).
 *
 * Port of the X1 counter-audit runs (tmp/ca/X1-vectors.mjs and X1-vectors2.mjs, notes/ca/X1-simulator-vectors.md §2):
 * every vector is a real transaction built and signed with kaspa-wasm 2.1.0, submitted to the node, and validated by the
 * simulator (validateTransactionScripts) with THE SAME transaction and THE SAME UTXOs (outpoint, amount, script, block DAA
 * score, covenant id) at the node's virtual DAA score and past median time. The test requires the simulator's verdict
 * (accept / reject) to equal the node's for every vector: the 38 of X1 plus N* vectors for the opcodes and rules added
 * by the S1 repair (Toccata arithmetic/bitwise/splice, introspection, covenant opcodes, CheckSigFromStack, ECDSA,
 * NullFail, disabled opcodes in dead branches, exact script-unit metering).
 */

const NET = "simnet";
const SUBNET = "00".repeat(20);
const FEE = 3_000_000n;
const VAL = 1_000_000_000n;
const UNACCEPTED_DAA_SCORE = U64_MAX;

interface Utxo {
  txid: string;
  index: number;
  amount: bigint;
  script: string;
  blockDaaScore: bigint;
  isCoinbase: boolean;
  covenantId?: string | undefined;
}

type Signer = (key: VectorKey) => string;

interface InDesc {
  utxo: Utxo;
  sequence: bigint;
  sigOpCount: number;
  computeBudget?: number;
  /** Builds the signature script; `sign` returns the 65-byte Schnorr signature (+ SIGHASH_ALL) of this input, hex. */
  sigScript: (sign: Signer, ecdsaSign: (priv: string) => string) => string;
}

interface OutDesc {
  value: bigint;
  script: string;
  covenant?: { authorizingInput: number; covenantId: string };
}

interface Desc {
  version: number;
  lockTime: bigint;
  inputs: InDesc[];
  outputs: OutDesc[];
  genesisGroups?: Array<{ authorizingInput: number; outputs: number[] }>;
}

interface Row {
  id: string;
  title: string;
  txid: string;
  daa: string;
  node: "ACCEPTED" | "REJECTED";
  nodeMessage: string;
  sim: "ACCEPTED" | "REJECTED";
  simMessage: string;
  match: boolean;
}

let session: IsolatedSimnetSession | undefined;
let k: any;
let rpc: any;
const rows: Row[] = [];

const minerAddress = () => String(new k.PrivateKey(KEYS.miner.priv).toPublicKey().toAddress(NET).toString());
const addrOf = (script: string) => String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(0, script), NET).toString());

function storageMass(desc: Desc): bigint {
  const cell = (amount: bigint, script: string, cov: unknown) => ({ amountSompi: amount, scriptBytes: script.length / 2, covenantId: Boolean(cov) });
  const m = v1StorageMass(
    desc.inputs.map((i) => cell(i.utxo.amount, i.utxo.script, i.utxo.covenantId)),
    desc.outputs.map((o) => cell(o.value, o.script, o.covenant))
  );
  if (m === undefined) throw new Error("storage mass overflow");
  return m;
}

function wasmTx(desc: Desc, sigScripts: string[]): any {
  const tx = new k.Transaction({
    version: desc.version,
    inputs: desc.inputs.map((i, n) => ({
      previousOutpoint: { transactionId: i.utxo.txid, index: i.utxo.index },
      signatureScript: sigScripts[n] ?? "",
      sequence: i.sequence,
      sigOpCount: i.sigOpCount,
      ...(desc.version >= 1 ? { computeBudget: i.computeBudget ?? 0 } : {}),
      utxo: {
        outpoint: { transactionId: i.utxo.txid, index: i.utxo.index },
        amount: i.utxo.amount,
        scriptPublicKey: new k.ScriptPublicKey(0, i.utxo.script),
        blockDaaScore: i.utxo.blockDaaScore,
        isCoinbase: i.utxo.isCoinbase,
        ...(i.utxo.covenantId ? { covenant_id: i.utxo.covenantId } : {})
      }
    })),
    outputs: desc.outputs.map((o) => ({
      value: o.value,
      scriptPublicKey: new k.ScriptPublicKey(0, o.script),
      ...(o.covenant ? { covenant: { authorizingInput: o.covenant.authorizingInput, covenantId: o.covenant.covenantId } } : {})
    })),
    lockTime: desc.lockTime,
    subnetworkId: SUBNET,
    gas: 0n,
    payload: ""
  });
  if (desc.genesisGroups?.length) tx.populateGenesisCovenants(desc.genesisGroups);
  tx.storageMass = storageMass(desc);
  tx.finalize();
  return tx;
}

/** The transaction as the simulator validates it (the RPC form). */
function simTx(desc: Desc, sigScripts: string[]): KaspaRpcTransaction {
  return {
    version: desc.version,
    inputs: desc.inputs.map((i, n) => ({
      previousOutpoint: { transactionId: i.utxo.txid, index: i.utxo.index },
      signatureScript: sigScripts[n] ?? "",
      sequence: i.sequence,
      sigOpCount: i.sigOpCount,
      ...(desc.version >= 1 ? { computeBudget: i.computeBudget ?? 0 } : {})
    })),
    outputs: desc.outputs.map((o) => ({
      amount: o.value,
      scriptPublicKey: { version: 0, scriptPublicKey: o.script },
      ...(o.covenant ? { covenant: { authorizingInput: o.covenant.authorizingInput, covenantId: o.covenant.covenantId } } : {})
    })),
    lockTime: desc.lockTime,
    subnetworkId: SUBNET,
    gas: 0n,
    payload: ""
  };
}

function sighashTxOf(desc: Desc): KaspaSighashTransaction {
  return {
    version: desc.version,
    inputs: desc.inputs.map((i) => ({ transactionId: i.utxo.txid, index: i.utxo.index, sequence: i.sequence, sigOpCount: i.sigOpCount })),
    outputs: desc.outputs.map((o) => ({ value: o.value, scriptPublicKey: { version: 0, script: o.script }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: desc.lockTime,
    subnetworkId: SUBNET,
    gas: 0n,
    payload: ""
  };
}

const ECDSA_DOMAIN = sha256(new TextEncoder().encode("TransactionSigningHashECDSA"));

/** Signs every input (resolving genesis covenant ids first) and returns the final kaspa-wasm tx and its signature scripts. */
function buildSigned(desc: Desc): { tx: any; sigScripts: string[] } {
  const unsigned = wasmTx(desc, []);
  unsigned.outputs.forEach((o: any, n: number) => {
    if (o.covenant) desc.outputs[n]!.covenant = { authorizingInput: Number(o.covenant.authorizingInput), covenantId: String(o.covenant.covenantId).toLowerCase() };
  });
  delete desc.genesisGroups; // the bindings are explicit from here on
  const unsignedBound = wasmTx(desc, []);
  const sigScripts = desc.inputs.map((inp, n) =>
    inp.sigScript(
      (key) => {
        const s = String(k.createInputSignature(unsignedBound, n, new k.PrivateKey(key.priv), k.SighashType.All)).toLowerCase();
        if (!/^41[0-9a-f]{130}$/.test(s)) throw new Error(`unexpected kaspa-wasm signature encoding: ${s.slice(0, 8)}…`);
        return s.slice(2);
      },
      (priv) => {
        const schnorrHash = calcKaspaSchnorrSignatureHash(sighashTxOf(desc), n, { amount: inp.utxo.amount, scriptPublicKey: { version: 0, script: inp.utxo.script } }, 1);
        const msg = sha256(new Uint8Array([...ECDSA_DOMAIN, ...schnorrHash]));
        const sig = secp256k1.sign(msg, Buffer.from(priv, "hex"), { lowS: true });
        return Buffer.from(sig.toCompactRawBytes()).toString("hex") + "01";
      }
    )
  );
  return { tx: wasmTx(desc, sigScripts), sigScripts };
}

async function virtualState(): Promise<{ daa: bigint; pastMedianTimeMs: bigint }> {
  const info = await rpc.getBlockDagInfo();
  return { daa: BigInt(info.virtualDaaScore), pastMedianTimeMs: BigInt(info.pastMedianTime) };
}

async function mine(n: number): Promise<void> {
  const to = minerAddress();
  for (let i = 0; i < n; i++) {
    const t = await rpc.getBlockTemplate({ payAddress: to, extraData: "" });
    await rpc.submitBlock({ block: t.block, allowNonDAABlocks: false });
  }
}

async function waitDaa(target: bigint, ms = 30_000): Promise<bigint> {
  const end = Date.now() + ms;
  for (;;) {
    const { daa } = await virtualState();
    if (daa >= target) return daa;
    if (Date.now() > end) throw new Error(`virtual DAA did not reach ${target} (at ${daa})`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function utxosOf(addresses: string[]): Promise<Utxo[]> {
  const r = await rpc.getUtxosByAddresses({ addresses });
  return (r.entries ?? []).map((e: any) => {
    const entry = e.entry ?? e;
    const cov = entry.covenantId ?? e.covenantId;
    return {
      txid: String(entry.outpoint?.transactionId ?? e.outpoint?.transactionId).toLowerCase(),
      index: Number(entry.outpoint?.index ?? e.outpoint?.index),
      amount: BigInt(entry.amount ?? e.amount),
      script: String(entry.scriptPublicKey?.script ?? e.scriptPublicKey?.script ?? "").toLowerCase(),
      blockDaaScore: BigInt(entry.blockDaaScore ?? e.blockDaaScore ?? 0),
      isCoinbase: Boolean(entry.isCoinbase ?? e.isCoinbase),
      ...(cov ? { covenantId: String(cov.toString ? cov.toString() : cov).toLowerCase() } : {})
    };
  });
}

async function waitForOutputs(txid: string, addresses: string[], count: number): Promise<Utxo[]> {
  for (let tries = 0; tries < 200; tries++) {
    const found = (await utxosOf([...new Set(addresses)])).filter((u) => u.txid === txid.toLowerCase());
    if (found.length >= count) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`outputs of ${txid} not indexed`);
}

const simUtxo = (u: Utxo): SimulatorUtxo => ({
  transactionId: u.txid,
  index: u.index,
  address: "simnet-mirror",
  amountSompi: u.amount,
  scriptPublicKey: u.script,
  scriptPublicKeyVersion: 0,
  blockDaaScore: u.blockDaaScore,
  isCoinbase: u.isCoinbase,
  ...(u.covenantId ? { covenantId: u.covenantId } : {})
});

async function runVector(id: string, title: string, desc: Desc): Promise<{ row: Row; tx: any; desc: Desc }> {
  const { tx, sigScripts } = buildSigned(desc);
  const { daa, pastMedianTimeMs } = await virtualState();
  let nodeAccepted = false;
  let nodeMessage = "accepted";
  try {
    await rpc.submitTransaction({ transaction: tx, allowOrphan: false });
    nodeAccepted = true;
  } catch (e: any) {
    nodeMessage = String(e?.message ?? e);
  }
  const sim = validateTransactionScripts(simTx(desc, sigScripts), desc.inputs.map((i) => simUtxo(i.utxo)), daa, { pastMedianTimeMs });
  const row: Row = {
    id,
    title,
    txid: String(tx.id),
    daa: daa.toString(),
    node: nodeAccepted ? "ACCEPTED" : "REJECTED",
    nodeMessage,
    sim: sim.valid ? "ACCEPTED" : "REJECTED",
    simMessage: sim.valid ? "valid" : String(sim.error),
    match: nodeAccepted === sim.valid
  };
  rows.push(row);
  console.log(`[${id}] ${title}\n  txid=${row.txid} daa=${row.daa}\n  NODE ${row.node}: ${row.nodeMessage.slice(0, 300)}\n  SIM  ${row.sim}: ${row.simMessage.slice(0, 300)}\n  => ${row.match ? "MATCH" : "MISMATCH"}`);
  return { row, tx, desc };
}

// ── vectors ───────────────────────────────────────────────────────────────

const SIL = loadSilverTemplates();
const CSFS_MSG = Buffer.from(sha256(new TextEncoder().encode("hardkas-sim-consensus-vectors:csfs"))).toString("hex");
const ECDSA_PRIV = KEYS.owner.priv;
const ECDSA_PUB = Buffer.from(secp256k1.getPublicKey(Buffer.from(ECDSA_PRIV, "hex"), true)).toString("hex");
const meteringRedeem = (d: number) => `4d${(d & 0xff).toString(16).padStart(2, "0")}${(d >> 8).toString(16).padStart(2, "0")}${"07".repeat(d)}aa7551`;

/** Redeem scripts of the N* vectors (new opcodes and rules; the node is the oracle). */
const NEW = {
  /** WITHIN, MIN, MAX, MUL, DIV, MOD (opcodes/mod.rs:649-756). */
  // 5 0 10 WITHIN VERIFY · 3 7 MIN 3 NUMEQUALVERIFY · 3 7 MAX 7 NUMEQUALVERIFY · 6 7 MUL 42 NUMEQUALVERIFY ·
  // -7 2 DIV -3 NUMEQUALVERIFY · -7 2 MOD -1 NUMEQUAL
  ARITH: "55005aa569" + "5357a3539d" + "5357a4579d" + "565795012a9d" + "0187529601839d" + "018752974f9c",
  /** AND, INVERT, CAT, SUBSTR. */
  BITS: "020f0f02ff008402" + "0f0088" + "01008301ff88" + "0261620263647e51537f02626387",
  /** 1 / 0 → InvalidState. */
  DIV0: "510096",
  /** Introspection of the spent UTXO, the outputs and the transaction. */
  INTRO1:
    `00be${pushI64(VAL)}9d` + "00c1009d" + `00c5${pushI64(37n)}9d` + "c4009d" + `00c7${pushI64(36n)}9d` + "b9009d" + "b3519d" + "b4519d" + "b2009d" + "b5009d" + "b7009d" + `b614${"00".repeat(20)}88` + "51",
  /** OpTxInputDaaScore(0) >= 1000. */
  INTRO2: `00c0${pushI64(1000n)}a2`,
  /** OpTxOutputSpk(0) == version (2 bytes BE) ‖ miner P2PK script. */
  INTRO3: `00c3${pushData("0000" + p2pkScript(KEYS.miner.xonly))}87`,
  /** OpTxInputSeq(0) == 8 raw little-endian bytes of sequence 0. */
  SEQ: `00bd08${"00".repeat(8)}87`,
  /** A disabled opcode (OpLeft) in a branch that is not executed. */
  DIS: "0063806851",
  /** OpCheckSigFromStack over a fixed message signed by the owner. */
  CSFS: `40${Buffer.from(schnorr.sign(Buffer.from(CSFS_MSG, "hex"), Buffer.from(KEYS.owner.priv, "hex"))).toString("hex")}20${CSFS_MSG}20${KEYS.owner.xonly}d7`,
  /** 1-of-2 CHECKMULTISIG NOT (NullFail with a non-empty wrong signature). */
  NULLF: `5120${KEYS.owner.xonly}20${KEYS.recipient.xonly}52ae91`,
  /** <33-byte ECDSA key> CHECKSIGECDSA. */
  ECD: `21${ECDSA_PUB}ab`,
  /** v1 metering: 4D + 77 script units; with compute budget 1 (19 999 units) D = 4980 fits and D = 4981 does not. */
  MET_OK: meteringRedeem(4980),
  MET_BAD: meteringRedeem(4981),
  /** <owner> CHECKSIG under compute budget 0. */
  CHK0: `20${KEYS.owner.xonly}ac`,
  /** Covenant introspection of a continuation: InputCovenantId, Cov{Input,Output}{Count,Idx}, AuthOutput{Count,Idx}, OutputAuthorizingInput. */
  COVR: "00cfd0519d" + "00cfd2519d" + "00cf00d1009d" + "00cf00d3009d" + "00cb519d" + "0000cc009d" + "00d6009d" + "00cf00d587"
};

describe("simulator consensus parity with rusty-kaspad v2.1.0 (X1 vectors + N vectors)", () => {
  beforeAll(async () => {
    (globalThis as any).WebSocket = WebSocket;
    k = loadManagedKaspaWasmSync();
    session = await startIsolatedSimnet({ minerFixture: "alice" });
    rpc = new k.RpcClient({ url: session.rpcUrl, encoding: k.Encoding.SerdeJson, networkId: NET });
    await rpc.connect({ blockAsyncConnect: true });
  }, 180_000);

  afterAll(async () => {
    try {
      await rpc?.disconnect();
    } catch {
      /* ignore */
    }
    if (session) await stopIsolatedSimnet(session);
    console.log(`[CONSENSUS_VECTORS] ${JSON.stringify(rows)}`);
  }, 120_000);

  it("the node is rusty-kaspad 2.1.0 on simnet with a UTXO index", async () => {
    const info = await rpc.getServerInfo();
    expect(info.serverVersion).toBe("2.1.0");
    expect(info.networkId).toBe("simnet");
    expect(info.hasUtxoIndex).toBe(true);
  });

  it("every vector gets the same verdict from the simulator and from the node", async () => {
    // ── funding: 1100 blocks (coinbase maturity 1000 DAA) and one P2SH/P2PK output per vector ──
    await mine(1100);
    let daa = await waitDaa(1100n);
    const mature = (await utxosOf([minerAddress()]))
      .filter((u) => u.isCoinbase && u.blockDaaScore + 1000n <= daa)
      .sort((a, b) => (a.amount > b.amount ? -1 : 1));

    const p2sh: Record<string, string> = {
      A: REDEEM.A, B: REDEEM.B, B2: REDEEM.B2, C: REDEEM.B, C2: REDEEM.C2, C2b: REDEEM.C2b, C3: REDEEM.TRUE, C4: REDEEM.C4, C5: REDEEM.TRUE,
      D: REDEEM.D, D2: REDEEM.CSV1, D3: REDEEM.CSV1, D4: REDEEM.CSV1, H1: REDEEM.TRUE, H2: REDEEM.H2, H3: REDEEM.H3, H4: REDEEM.H4, H4c: REDEEM.H4,
      H6: REDEEM.TRUE, G3: REDEEM.G3, G4: REDEEM.G4, S1: SIL.TWT, S1e: SIL.TWT, S2: SIL.TWT, S3: SIL.TLS, S4: SIL.ABI,
      Afix: REDEEM.A, BTCh: REDEEM.BTC, BTCd: REDEEM.BTC, INVh: REDEEM.INV, INVt: REDEEM.INV,
      N1: NEW.ARITH, N2: NEW.BITS, N3: NEW.DIV0, N4: NEW.INTRO1, N5: NEW.INTRO2, N6: NEW.INTRO3, N7: NEW.SEQ, N8: NEW.DIS, N9: NEW.CSFS,
      N10: NEW.NULLF, N10c: NEW.NULLF, N11: NEW.ECD, N12a: NEW.MET_OK, N12b: NEW.MET_BAD, N13: NEW.CHK0
    };
    const p2pkTags = ["E", "F", "E2", "H7", "FC"];
    const outs = [
      ...Object.entries(p2sh).map(([tag, redeem]) => ({ tag, value: VAL, script: p2shScript(redeem) })),
      ...p2pkTags.map((tag) => ({ tag, value: VAL, script: p2pkScript(KEYS.miner.xonly) }))
    ];
    const need = VAL * BigInt(outs.length) + 2n * FEE + 2_000_000_000n;
    const ins: Utxo[] = [];
    let sum = 0n;
    for (const u of mature) {
      ins.push(u);
      sum += u.amount;
      if (sum >= need) break;
    }
    expect(sum >= need, `mature funds ${sum} < ${need}`).toBe(true);
    const fundDesc: Desc = {
      version: 0,
      lockTime: 0n,
      inputs: ins.map((u) => ({ utxo: u, sequence: 0n, sigOpCount: 1, sigScript: (sign) => pushData(sign(KEYS.miner)) })),
      outputs: [...outs.map((o) => ({ value: o.value, script: o.script })), { value: sum - VAL * BigInt(outs.length) - 2n * FEE, script: p2pkScript(KEYS.miner.xonly) }]
    };
    const fund = buildSigned(fundDesc);
    await rpc.submitTransaction({ transaction: fund.tx, allowOrphan: false });
    await mine(1);
    daa = await waitDaa(daa + 1n);
    const fundTxid = String(fund.tx.id).toLowerCase();
    const fundUtxos = await waitForOutputs(fundTxid, outs.map((o) => addrOf(o.script)), outs.length);
    const U: Record<string, Utxo> = {};
    outs.forEach((o, i) => {
      const u = fundUtxos.find((x) => x.index === i);
      if (!u) throw new Error(`missing funding output ${i}`);
      U[o.tag] = u;
    });
    await mine(5);
    daa = await waitDaa(daa + 5n);

    const out1 = (u: Utxo): OutDesc[] => [{ value: u.amount - FEE, script: p2pkScript(KEYS.miner.xonly) }];
    const p2shIn = (u: Utxo, redeem: string, o: { args?: string | ((s: Signer, e: (p: string) => string) => string); sequence?: bigint; sigOpCount?: number; computeBudget?: number } = {}): InDesc => ({
      utxo: u,
      sequence: o.sequence ?? 0n,
      sigOpCount: o.sigOpCount ?? 1,
      ...(o.computeBudget !== undefined ? { computeBudget: o.computeBudget } : {}),
      sigScript: (s, e) => (typeof o.args === "function" ? o.args(s, e) : o.args ?? "") + pushData(redeem)
    });
    const sig = (key: VectorKey) => (s: Signer) => pushData(s(key));
    const v0 = (lockTime: bigint, input: InDesc, outputs?: OutDesc[]): Desc => ({ version: 0, lockTime, inputs: [input], outputs: outputs ?? out1(input.utxo) });
    const v1 = (input: InDesc, outputs?: OutDesc[]): Desc => ({ version: 1, lockTime: 0n, inputs: [input], outputs: outputs ?? out1(input.utxo) });

    // HK-02 · CLTV / CSV (X1 §2.2)
    await runVector("A", "<1> CLTV DROP TRUE", v0(1n, p2shIn(U.A!, REDEEM.A)));
    const vb = await runVector("B", "<1> CLTV TRUE", v0(1n, p2shIn(U.B!, REDEEM.B), [{ value: U.B!.amount - FEE, script: p2shScript(REDEEM.TRUE) }]));
    await runVector("B2", "<1> CLTV <pk> CHECKSIG", v0(1n, p2shIn(U.B2!, REDEEM.B2, { args: sig(KEYS.owner) })));
    await runVector("C", "lockTime 6e11, DAA operand", v0(600_000_000_000n, p2shIn(U.C!, REDEEM.B)));
    await runVector("C2", "lockTime 6e11, 6-byte script number operand", v0(600_000_000_000n, p2shIn(U.C2!, REDEEM.C2)));
    await runVector("C2b", "lockTime 6e11, ScriptBuilder.addLockTime(6e11)", v0(600_000_000_000n, p2shIn(U.C2b!, REDEEM.C2b)));
    await runVector("C3", "tx lockTime 600 000 000 (DAA type)", v0(600_000_000n, p2shIn(U.C3!, REDEEM.TRUE)));
    await runVector("C4", "<0x80> CLTV TRUE", v0(1n, p2shIn(U.C4!, REDEEM.C4)));
    await runVector("C5", "lockTime DAA+100000, every sequence u64::MAX", v0(daa + 100_000n, p2shIn(U.C5!, REDEEM.TRUE, { sequence: U64_MAX })));
    await runVector("D", "addSequence(2^63|1) CSV TRUE", v0(0n, p2shIn(U.D!, REDEEM.D)));
    await runVector("D2", "<1> CSV TRUE, input sequence 2^63", v0(0n, p2shIn(U.D2!, REDEEM.CSV1, { sequence: 1n << 63n })));
    await runVector("D3", "<1> CSV TRUE, input sequence 2^32", v0(0n, p2shIn(U.D3!, REDEEM.CSV1, { sequence: 1n << 32n })));
    await runVector("D4", "<1> CSV TRUE, sequence 1, age >= 5", v0(0n, p2shIn(U.D4!, REDEEM.CSV1, { sequence: 1n })));
    // X1-vectors2: Bitcoin-style CLTV scripts
    await runVector("Afix", "<1> CLTV DROP TRUE with a padding push", v0(1n, p2shIn(U.Afix!, REDEEM.A, { args: "51" })));
    await runVector("BTCh", "<1> CLTV DROP <owner> CHECKSIG, [sig_owner]", v0(1n, p2shIn(U.BTCh!, REDEEM.BTC, { args: sig(KEYS.owner) })));
    await runVector("BTCd", "<1> CLTV DROP <owner> CHECKSIG, [sig_owner, 1]", v0(1n, p2shIn(U.BTCd!, REDEEM.BTC, { args: (s) => sig(KEYS.owner)(s) + "51" })));
    await runVector("INVh", "<owner> <1> CLTV DROP CHECKSIG, [sig_owner]", v0(1n, p2shIn(U.INVh!, REDEEM.INV, { args: sig(KEYS.owner) })));
    await runVector("INVt", "<owner> <1> CLTV DROP CHECKSIG, third party [sig, pk]", v0(1n, p2shIn(U.INVt!, REDEEM.INV, { args: (s) => sig(KEYS.attacker)(s) + pushData(KEYS.attacker.xonly) })));

    // HK-08 · script and transaction rules (X1 §2.4)
    await runVector("H1", "signature script not push-only", v0(0n, p2shIn(U.H1!, REDEEM.TRUE, { args: "5175" })));
    await runVector("H2", "clean stack (TRUE TRUE)", v0(0n, p2shIn(U.H2!, REDEEM.H2)));
    await runVector("H3", "245 pushes + 244 DROP", v0(0n, p2shIn(U.H3!, REDEEM.H3)));
    await runVector("H4", "<pk> CHECKSIG NOT, hashtype 0x03", v0(0n, p2shIn(U.H4!, REDEEM.H4, { args: pushData("00".repeat(64) + "03") })));
    await runVector("H4c", "<pk> CHECKSIG NOT, 64x00 + 0x01", v0(0n, p2shIn(U.H4c!, REDEEM.H4, { args: pushData("00".repeat(64) + "01") })));
    await runVector("H6", "sequence 1000 on a UTXO of age ~5", v0(0n, p2shIn(U.H6!, REDEEM.TRUE, { sequence: 1000n })));
    await runVector("H7", "P2PK v0 with sigOpCount 0", v0(0n, { utxo: U.H7!, sequence: 0n, sigOpCount: 0, sigScript: sig(KEYS.miner) }));
    {
      const bOut: Utxo = { txid: String(vb.tx.id).toLowerCase(), index: 0, amount: U.B!.amount - FEE, script: p2shScript(REDEEM.TRUE), blockDaaScore: UNACCEPTED_DAA_SCORE, isCoinbase: false };
      await runVector("M1", "chained spend of B's output (B in mempool)", v0(0n, p2shIn(bOut, REDEEM.TRUE)));
    }

    // HK-03 · covenants (X1 §2.3)
    const covOut = (cov: OutDesc["covenant"]): OutDesc => ({ value: VAL / 2n, script: p2shScript(REDEEM.TRUE), ...(cov ? { covenant: cov } : {}) });
    const p2pkV1 = (u: Utxo): InDesc => ({ utxo: u, sequence: 0n, sigOpCount: 0, computeBudget: 10, sigScript: sig(KEYS.miner) });
    const change = (u: Utxo, spent: bigint): OutDesc => ({ value: u.amount - spent - FEE, script: p2pkScript(KEYS.miner.xonly) });
    const randomId = "a1b2c3d4" + "5e".repeat(28);
    await runVector("E", "genesis with an invented covenant id", v1(p2pkV1(U.E!), [covOut({ authorizingInput: 0, covenantId: randomId }), change(U.E!, VAL / 2n)]));
    const vf = await runVector("F", "genesis via populateGenesisCovenants, 2 covenant outputs", {
      version: 1,
      lockTime: 0n,
      inputs: [p2pkV1(U.F!)],
      outputs: [{ value: VAL / 4n, script: p2shScript(REDEEM.TRUE) }, { value: VAL / 4n, script: p2shScript(REDEEM.CNT) }, change(U.F!, VAL / 2n)],
      genesisGroups: [{ authorizingInput: 0, outputs: [0, 1] }]
    });
    const X = vf.desc.outputs[0]!.covenant!.covenantId;
    const coreX = kaspaCovenantId({ transactionId: U.F!.txid, index: U.F!.index }, [
      { index: 0, value: VAL / 4n, scriptPublicKey: { version: 0, script: p2shScript(REDEEM.TRUE) } },
      { index: 1, value: VAL / 4n, scriptPublicKey: { version: 0, script: p2shScript(REDEEM.CNT) } }
    ]);
    expect(coreX, "kaspaCovenantId equals populateGenesisCovenants").toBe(X);
    await runVector("E2", "another input claims the existing id X", v1(p2pkV1(U.E2!), [covOut({ authorizingInput: 0, covenantId: X }), change(U.E2!, VAL / 2n)]));
    const vfc = await runVector("FC", "genesis of two COVR outputs (covenant-introspection redeem)", {
      version: 1,
      lockTime: 0n,
      inputs: [p2pkV1(U.FC!)],
      outputs: [{ value: VAL / 4n, script: p2shScript(NEW.COVR) }, { value: VAL / 4n, script: p2shScript(NEW.COVR) }, change(U.FC!, VAL / 2n)],
      genesisGroups: [{ authorizingInput: 0, outputs: [0, 1] }]
    });
    const XC = vfc.desc.outputs[0]!.covenant!.covenantId;
    await runVector("G3", "0 OUTPUTCOVENANTID <ZERO_HASH> EQUAL", v1(p2shIn(U.G3!, REDEEM.G3, { sigOpCount: 0, computeBudget: 1 })));
    await runVector("G4", "0 OUTPUTAUTHORIZINGINPUT -1 NUMEQUAL", v1(p2shIn(U.G4!, REDEEM.G4, { sigOpCount: 0, computeBudget: 1 })));

    // SilverScript (silverc 1.0.0)
    await runVector("S2", "TransferWithTimeout.transfer", v0(0n, p2shIn(U.S2!, SIL.TWT, { args: (s) => sig(KEYS.recipient)(s) + pushData(SELECTOR.transfer) })));
    await runVector("S1e", "TransferWithTimeout.reclaim before 500 DAA", v0(0n, p2shIn(U.S1e!, SIL.TWT, { sequence: 500n, args: (s) => sig(KEYS.sender)(s) + pushData(SELECTOR.reclaim) })));
    await runVector("S3", "TimeLockSig.claim(s, t = 6e11)", v0(600_000_000_000n, p2shIn(U.S3!, SIL.TLS, { args: (s) => sig(KEYS.owner)(s) + pushI64(600_000_000_000n) + pushData(SELECTOR.claim) })));
    await runVector("S4", "AbiVectors.timed(t = 6e11)", v0(600_000_000_000n, p2shIn(U.S4!, SIL.ABI, { args: pushI64(600_000_000_000n) + pushData(SELECTOR.timed) })));

    // N · opcodes and rules added by the repair (node = oracle)
    await runVector("N1", "WITHIN MIN MAX MUL DIV MOD", v0(0n, p2shIn(U.N1!, NEW.ARITH)));
    await runVector("N2", "AND INVERT CAT SUBSTR", v0(0n, p2shIn(U.N2!, NEW.BITS)));
    await runVector("N3", "1 0 DIV", v0(0n, p2shIn(U.N3!, NEW.DIV0)));
    await runVector("N4", "UTXO/output/tx introspection", v0(0n, p2shIn(U.N4!, NEW.INTRO1)));
    await runVector("N5", "OpTxInputDaaScore(0) >= 1000", v0(0n, p2shIn(U.N5!, NEW.INTRO2)));
    await runVector("N6", "OpTxOutputSpk(0) = version BE ‖ script", v0(0n, p2shIn(U.N6!, NEW.INTRO3)));
    await runVector("N7", "OpTxInputSeq pushes 8 raw bytes", v0(0n, p2shIn(U.N7!, NEW.SEQ)));
    await runVector("N8", "disabled opcode in a dead branch", v0(0n, p2shIn(U.N8!, NEW.DIS)));
    await runVector("N9", "OpCheckSigFromStack", v0(0n, p2shIn(U.N9!, NEW.CSFS)));
    await runVector("N10", "1-of-2 CHECKMULTISIG with a non-empty wrong signature (NullFail)", v0(0n, p2shIn(U.N10!, NEW.NULLF, { sigOpCount: 2, args: pushData("00".repeat(64) + "01") })));
    await runVector("N10c", "1-of-2 CHECKMULTISIG NOT with an empty signature", v0(0n, p2shIn(U.N10c!, NEW.NULLF, { args: "00" })));
    await runVector("N11", "OpCheckSigECDSA with a valid ECDSA signature", v0(0n, p2shIn(U.N11!, NEW.ECD, { args: (_s, e) => pushData(e(ECDSA_PRIV)) })));
    await runVector("N12a", "metering: 4D+77 = 19 997 units under budget 1", v1(p2shIn(U.N12a!, NEW.MET_OK, { sigOpCount: 0, computeBudget: 1 })));
    await runVector("N12b", "metering: 4D+77 = 20 001 units under budget 1", v1(p2shIn(U.N12b!, NEW.MET_BAD, { sigOpCount: 0, computeBudget: 1 })));
    await runVector("N13", "v1 P2SH CHECKSIG with compute budget 0", v1(p2shIn(U.N13!, NEW.CHK0, { sigOpCount: 0, computeBudget: 0, args: sig(KEYS.owner) })));

    // ── confirm F and FC, then continuations ──
    const before = (await virtualState()).daa;
    await mine(3);
    await waitDaa(before + 3n);
    const fUtxos = await waitForOutputs(String(vf.tx.id), [p2shScript(REDEEM.TRUE), p2shScript(REDEEM.CNT)].map(addrOf), 2);
    const F0 = fUtxos.find((u) => u.index === 0)!;
    const F1 = fUtxos.find((u) => u.index === 1)!;
    expect(F0.covenantId, "the node indexes the covenant id of a genesis output").toBe(X);
    const fcUtxos = await waitForOutputs(String(vfc.tx.id), [addrOf(p2shScript(NEW.COVR))], 2);
    const FC0 = fcUtxos.find((u) => u.index === 0)!;
    const FC1 = fcUtxos.find((u) => u.index === 1)!;
    expect(FC0.covenantId).toBe(XC);

    await runVector("G", "continuation of F:0", v1(p2shIn(F0, REDEEM.TRUE, { sigOpCount: 0, computeBudget: 1 }), [{ value: F0.amount - FEE, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: X } }]));
    await runVector("G2", "continuation + genesis from F:1 (0 AUTHOUTPUTCOUNT 1 NUMEQUAL)", {
      version: 1,
      lockTime: 0n,
      inputs: [p2shIn(F1, REDEEM.CNT, { sigOpCount: 0, computeBudget: 1 })],
      outputs: [
        { value: (F1.amount - FEE) / 2n, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: X } },
        { value: (F1.amount - FEE) / 2n, script: p2shScript(REDEEM.TRUE) }
      ],
      genesisGroups: [{ authorizingInput: 0, outputs: [1] }]
    });
    await runVector("N16", "covenant opcodes on a continuation of FC:0", v1(p2shIn(FC0, NEW.COVR, { sigOpCount: 0, computeBudget: 1 }), [{ value: FC0.amount - FEE, script: p2shScript(REDEEM.TRUE), covenant: { authorizingInput: 0, covenantId: XC } }]));
    await runVector("N16b", "covenant opcodes when FC:1 drops the covenant", v1(p2shIn(FC1, NEW.COVR, { sigOpCount: 0, computeBudget: 1 })));

    // ── reclaim after the 500-DAA period ──
    const now = (await virtualState()).daa;
    const target = U.S1!.blockDaaScore + 505n;
    if (now < target) {
      await mine(Number(target - now));
      await waitDaa(target);
    }
    await runVector("S1", "TransferWithTimeout.reclaim after 500 DAA", v0(0n, p2shIn(U.S1!, SIL.TWT, { sequence: 500n, args: (s) => sig(KEYS.sender)(s) + pushData(SELECTOR.reclaim) })));

    const mismatches = rows.filter((r) => !r.match).map((r) => `${r.id}: node ${r.node} (${r.nodeMessage.slice(0, 160)}) / simulator ${r.sim} (${r.simMessage.slice(0, 160)})`);
    console.log(`[CONSENSUS_VECTORS_SUMMARY] ${rows.length} vectors, ${rows.length - mismatches.length} match, ${mismatches.length} mismatch`);
    expect(rows.length).toBeGreaterThanOrEqual(38 + 18);
    expect(mismatches).toEqual([]);
  }, 600_000);
});
