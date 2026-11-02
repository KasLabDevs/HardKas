import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";
import { parseWasmTxToRpc, type V1NodeUtxo, type V1PreflightNode } from "@hardkas/accounts";
import { PAYMENT_PREFLIGHT_GUARANTEE, preflightPaymentSend } from "../src/payment-preflight.js";

// -----------------------------------------------------------------------------
// PAYMENT-PREFLIGHT-1 · the opt-in check of a payment send, on its own, against an in-memory node. Transactions are
// built and signed by the official kaspa-wasm (Transaction, createInputSignature) and written as HardKAS writes a signed
// payload (parseWasmTxToRpc); the node lists UTXOs by address. Every way an input or a signature can differ from what the
// node lists is refused with its code; nothing in the plan or the payload is taken on trust.
// -----------------------------------------------------------------------------

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const KAS = 100_000_000n;
const SUBNETWORK = "0".repeat(40);
let k: any;

type Opts = {
  inputs?: number;
  version?: 0 | 1;
  /** sighash type each input is signed with (default ALL) */
  sighash?: (n: number) => number;
  /** the key each input is signed with (default its owner's) */
  signer?: (n: number) => string;
  /** the amount the signer is told input n spends (default the node's) */
  signedAmount?: (n: number, amount: bigint) => bigint;
  sigOpCount?: number;
};

type Fixture = {
  plan: any;
  raw: string;
  txId: string;
  keys: string[];
  addresses: string[];
  keyOf: (n: number) => string;
  /** the node: what it lists, by address, and what its mempool spends */
  node: { utxos: Array<{ key: string; address: string; utxo: V1NodeUtxo }>; pending: Set<string> };
};

const ownerKey = (n: number) => hash(`pp1 owner ${n}`);
const xOnly = (key: string) => String(new k.PrivateKey(key).toPublicKey().toXOnlyPublicKey().toString());

/** A payment of `inputs` inputs (one owner each) to one payee, signed per input as `opts` says. */
function payment(opts: Opts = {}): Fixture {
  const count = opts.inputs ?? 1;
  const version = opts.version ?? 0;
  const keys = Array.from({ length: count }, (_, n) => ownerKey(n));
  const addresses = keys.map((key) => String(new k.PrivateKey(key).toPublicKey().toAddress("testnet-10").toString()));
  const payee = new k.ScriptPublicKey(0, `20${xOnly(hash("pp1 payee"))}ac`);
  const outpoints = keys.map((_, n) => ({ transactionId: hash(`pp1 utxo ${n}`), index: n }));
  const amounts = keys.map((_, n) => BigInt(n + 2) * KAS);
  const build = (signedAmounts: bigint[]) =>
    new k.Transaction({
      version,
      inputs: outpoints.map((o, n) => ({
        previousOutpoint: o,
        signatureScript: "",
        sequence: 0n,
        sigOpCount: opts.sigOpCount ?? (version === 0 ? 1 : 0),
        ...(version === 1 ? { computeBudget: 10 } : {}),
        utxo: { outpoint: o, amount: signedAmounts[n]!, scriptPublicKey: new k.ScriptPublicKey(0, `20${xOnly(keys[n]!)}ac`), blockDaaScore: 10n, isCoinbase: false }
      })),
      outputs: [{ value: amounts.reduce((s, a) => s + a, 0n) - 10_000n, scriptPublicKey: payee }],
      lockTime: 0n,
      subnetworkId: SUBNETWORK,
      gas: 0n,
      payload: ""
    });
  const signedAmounts = amounts.map((a, n) => opts.signedAmount?.(n, a) ?? a);
  const tx = build(signedAmounts);
  const scripts = keys.map((key, n) => String(k.createInputSignature(tx, n, new k.PrivateKey(opts.signer?.(n) ?? key), opts.sighash?.(n) ?? k.SighashType.All)));
  const rpc = parseWasmTxToRpc(tx.serializeToObject(), undefined, Object.fromEntries(scripts.map((s, n) => [n, { signatureScript: s }])));
  const raw = JSON.stringify(rpc);
  const plan = {
    contentHash: hash("pp1 plan"),
    from: { address: addresses[0] },
    inputs: outpoints.map((o, n) => ({ outpoint: o, amountSompi: amounts[n]!.toString(), address: addresses[n], scriptPublicKey: `000020${xOnly(keys[n]!)}ac` }))
  };
  return {
    plan,
    raw,
    txId: officialTxIdOf(raw),
    keys,
    addresses,
    keyOf: (n) => `${outpoints[n]!.transactionId}:${n}`,
    node: {
      utxos: outpoints.map((o, n) => ({
        key: `${o.transactionId}:${o.index}`,
        address: addresses[n]!,
        utxo: { amountSompi: amounts[n]!, scriptPublicKey: `000020${xOnly(keys[n]!)}ac`, blockDaaScore: 10n, isCoinbase: false }
      })),
      pending: new Set()
    }
  };
}

/** The in-memory node a check asks: UTXOs by address, the outpoints its mempool spends, its DAA score. */
function nodeOf(f: Fixture, o: { failUtxos?: boolean; failMempool?: boolean; failDaa?: boolean } = {}) {
  const reads = { utxos: 0, mempool: 0 };
  const node: V1PreflightNode = {
    networkId: "testnet-10",
    utxosByAddresses: async (addresses) => {
      reads.utxos += 1;
      if (o.failUtxos) throw new Error("the UTXO index is not available");
      return new Map(f.node.utxos.filter((u) => addresses.includes(u.address)).map((u) => [u.key, u.utxo]));
    },
    pendingSpentOutpoints: async () => {
      reads.mempool += 1;
      if (o.failMempool) throw new Error("PENDING_SPEND_EVIDENCE_UNAVAILABLE: mempool evidence could not be read: timeout");
      return f.node.pending;
    },
    virtualDaaScore: async () => {
      if (o.failDaa) throw new Error("no answer");
      return 777n;
    }
  };
  return { node, reads };
}

async function check(f: Fixture, o: Parameters<typeof nodeOf>[1] = {}, txId = f.txId) {
  const { node, reads } = nodeOf(f, o);
  try {
    return { result: await preflightPaymentSend({ plan: f.plan, rawTransaction: f.raw, txId, node }), error: undefined as any, reads };
  } catch (error: any) {
    return { result: undefined as any, error, reads };
  }
}

/** The payload with input n's signature script replaced (the transaction id does not cover signature scripts). */
function withScript(f: Fixture, n: number, script: (s: string, all: string[]) => string): Fixture {
  const tx = JSON.parse(f.raw);
  const all = tx.inputs.map((i: any) => i.signatureScript);
  tx.inputs[n].signatureScript = script(all[n], all);
  return { ...f, raw: JSON.stringify(tx) };
}

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
});

describe("PAYMENT-PREFLIGHT-1 · preflightPaymentSend, against an in-memory node", () => {
  it("PU-1 kaspa-wasm-signed v0 payments of 1, 2 and 3 inputs pass; the evidence names the DAA score, the inputs and the guarantee", async () => {
    for (const inputs of [1, 2, 3]) {
      const f = payment({ inputs });
      const r = await check(f);
      expect(r.error, `${inputs}: ${String(r.error?.message)}`).toBeUndefined();
      expect(r.result.evidence).toEqual({ observedAtDaaScore: "777", inputs, scope: "observer-local", guarantee: PAYMENT_PREFLIGHT_GUARANTEE });
      expect(r.reads).toEqual({ utxos: 1, mempool: 1 });
    }
  });

  it("PU-2 a v1 payment (P2PK, no binding) passes too: the v1 signature hash is checked; the DAA score is left out when the node does not give it", async () => {
    const f = payment({ inputs: 2, version: 1 });
    const r = await check(f, { failDaa: true });
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(r.result.evidence).toEqual({ inputs: 2, scope: "observer-local", guarantee: PAYMENT_PREFLIGHT_GUARANTEE });
  });

  it("PU-3 one byte of a signature changed (same transaction id): INPUT_SIGNATURE_INVALID naming the input", async () => {
    const f = payment({ inputs: 2 });
    const bad = withScript(f, 1, (s) => s.slice(0, 20) + (s[20] === "0" ? "1" : "0") + s.slice(21));
    expect(officialTxIdOf(bad.raw)).toBe(f.txId);
    const r = await check(bad);
    expect(r.error?.code).toBe("INPUT_SIGNATURE_INVALID");
    expect(r.error?.detail).toEqual({ input: 1 });
  });

  it("PU-4 two valid signatures swapped between inputs: INPUT_SIGNATURE_INVALID", async () => {
    const f = payment({ inputs: 2 });
    const swapped = withScript(withScript(f, 0, (_s, all) => all[1]!), 1, () => JSON.parse(f.raw).inputs[0].signatureScript);
    const r = await check(swapped);
    expect(r.error?.code).toBe("INPUT_SIGNATURE_INVALID");
  });

  it("PU-5 signed by another key than the one the node's script names: INPUT_SIGNATURE_INVALID", async () => {
    const r = await check(payment({ inputs: 2, signer: (n) => (n === 1 ? hash("pp1 intruder") : ownerKey(n)) }));
    expect(r.error?.code).toBe("INPUT_SIGNATURE_INVALID");
    expect(r.error?.detail).toEqual({ input: 1 });
  });

  it("PU-6 the signature commits to another amount than the node lists (the plan states the node's): only the signature can tell, INPUT_SIGNATURE_INVALID", async () => {
    const r = await check(payment({ signedAmount: (_n, a) => a + 1n }));
    expect(r.error?.code).toBe("INPUT_SIGNATURE_INVALID");
  });

  it("PU-7 a sighash type other than ALL, or an unlock that is not one 65-byte push: PREFLIGHT_SIGNATURE_UNVERIFIABLE (fail closed)", async () => {
    for (const type of ["Single", "AllAnyOneCanPay", "None"]) {
      const r = await check(payment({ sighash: () => k.SighashType[type] }));
      expect(r.error?.code, type).toBe("PREFLIGHT_SIGNATURE_UNVERIFIABLE");
      expect(r.error?.message, type).toMatch(/SIGHASH_ALL only/);
    }
    const f = payment();
    for (const [name, script] of [
      ["OP_PUSHDATA1", (s: string) => `4c${s}`],
      ["empty", () => ""],
      ["64-byte push", (s: string) => `40${s.slice(2, 130)}`]
    ] as const) {
      const r = await check(withScript(f, 0, script as (s: string) => string));
      expect(r.error?.code, name).toBe("PREFLIGHT_SIGNATURE_UNVERIFIABLE");
    }
  });

  it("PU-8 what the node lists decides: not listed (or only at another address), a covenant id, another amount or script, spent in its mempool", async () => {
    const cases: Array<[string, (f: Fixture) => void, string, string?]> = [
      ["not listed", (f) => (f.node.utxos = []), "INPUT_NOT_UNSPENT"],
      ["at another address", (f) => (f.node.utxos[0]!.address = f.addresses[0]!.replace(/.$/, "x")), "INPUT_NOT_UNSPENT"],
      ["covenant id", (f) => (f.node.utxos[0]!.utxo = { ...f.node.utxos[0]!.utxo, covenantId: hash("pp1 covenant") }), "COVENANT_UTXO_NOT_PAYMENT_INPUT"],
      ["amount", (f) => (f.node.utxos[0]!.utxo = { ...f.node.utxos[0]!.utxo, amountSompi: f.node.utxos[0]!.utxo.amountSompi + 1n }), "INPUT_DIFFERS_FROM_NODE", "amount"],
      ["script", (f) => (f.node.utxos[0]!.utxo = { ...f.node.utxos[0]!.utxo, scriptPublicKey: `000020${xOnly(hash("pp1 other"))}ac` }), "INPUT_DIFFERS_FROM_NODE", "scriptPublicKey"],
      ["pending", (f) => f.node.pending.add(f.keyOf(0)), "INPUT_PENDING_SPEND"]
    ];
    for (const [name, arrange, code, field] of cases) {
      const f = payment();
      arrange(f);
      const r = await check(f);
      expect(r.error?.code, name).toBe(code);
      if (field) expect(r.error?.detail?.field, name).toBe(field);
    }
  });

  it("PU-9 the plan: a declared covenant input is refused before the node is asked; no amount or no address anywhere: PREFLIGHT_PLAN_INCOMPLETE; without per-input addresses the payer's is used", async () => {
    const declared = payment();
    declared.plan.inputs[0].covenantId = hash("pp1 covenant");
    const a = await check(declared);
    expect(a.error?.code).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(a.reads).toEqual({ utxos: 0, mempool: 0 });
    const noAmount = payment();
    noAmount.plan.inputs[0].amountSompi = "two";
    expect((await check(noAmount)).error?.code).toBe("PREFLIGHT_PLAN_INCOMPLETE");
    const nowhere = payment();
    delete nowhere.plan.inputs[0].address;
    delete nowhere.plan.from;
    expect((await check(nowhere)).error?.code).toBe("PREFLIGHT_PLAN_INCOMPLETE");
    const payerOnly = payment();
    delete payerOnly.plan.inputs[0].address;
    delete payerOnly.plan.inputs[0].scriptPublicKey;
    const ok = await check(payerOnly);
    expect(ok.error, String(ok.error?.message)).toBeUndefined();
  });

  it("PU-10 the node's script is not a Schnorr P2PK (P2SH, ECDSA): PREFLIGHT_SIGNATURE_UNVERIFIABLE (only the node could verify it)", async () => {
    for (const [name, spk] of [
      ["p2sh", `0000aa20${hash("pp1 p2sh")}87`],
      ["ecdsa", `000021${"02" + hash("pp1 ecdsa")}ab`]
    ] as const) {
      const f = payment();
      delete f.plan.inputs[0].scriptPublicKey; // the plan states none: the node's is used as it is
      f.node.utxos[0]!.utxo = { ...f.node.utxos[0]!.utxo, scriptPublicKey: spk };
      const r = await check(f);
      expect(r.error?.code, name).toBe("PREFLIGHT_SIGNATURE_UNVERIFIABLE");
      expect(r.error?.message, name).toMatch(/not a Schnorr P2PK/);
    }
  });

  it("PU-11 a v0 input declaring 0 signature operations (its signature valid over that count): INPUT_SIG_OP_COUNT_INVALID", async () => {
    const r = await check(payment({ sigOpCount: 0 }));
    expect(r.error?.code).toBe("INPUT_SIG_OP_COUNT_INVALID");
  });

  it("PU-12 a transaction id that is not the payload's, or a payload that cannot be read: PREFLIGHT_SIGNATURE_UNVERIFIABLE", async () => {
    const f = payment();
    expect((await check(f, {}, "a".repeat(64))).error?.code).toBe("PREFLIGHT_SIGNATURE_UNVERIFIABLE");
    expect((await check({ ...f, raw: "deadbeef" })).error?.code).toBe("PREFLIGHT_SIGNATURE_UNVERIFIABLE");
  });

  it("PU-13 a node that cannot list UTXOs or read its mempool: PREFLIGHT_NODE_UNAVAILABLE / PENDING_SPEND_EVIDENCE_UNAVAILABLE (fail closed)", async () => {
    expect((await check(payment(), { failUtxos: true })).error?.code).toBe("PREFLIGHT_NODE_UNAVAILABLE");
    const mempool = await check(payment(), { failMempool: true });
    expect(mempool.error?.code).toBe("PENDING_SPEND_EVIDENCE_UNAVAILABLE");
    expect(mempool.error?.message).toMatch(/pending spend of an input could not be excluded/);
  });
});
