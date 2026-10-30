import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas } from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { finalizeTxPlanIdentity } from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1B (F1.0-bis, 2026-10-25), through `tx.sign`. What a plan says about its inputs is not
// trusted on its own: a plan written by hand, by another tool or by an older HardKAS can leave a covenant's UTXO
// unmarked. Before any signer is asked (an external one too), any account key read or anything written, `tx.sign` asks
// the node what each input is: a covenant's UTXO, an input the node does not list unspent, or a node that cannot be
// asked, and nothing is signed. A plan that declares a covenant input is refused before the node is asked at all.
// Loopback fake testnet-10 node whose answers change between planning and signing; throwaway keys; nothing sent.
// -----------------------------------------------------------------------------

type Entry = { txid: string; sompi: number; covenantId?: string };
type State = { entries: Entry[]; failUtxoReads: boolean; utxoReads: number };
const DAA = 50_000_000;
const KAS = 100_000_000;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const COVENANT_ID = hashOf("covenant-utxo-payment-filter-1b covenant");
const PAYER_KEY = hashOf("cuf1b payer");
let kaspa: any;
let payer = "";
let payee = "";
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};

type Fake = { url: string; close(): Promise<void> };
async function startFake(state: State): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const sink = hashOf("sink");
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: 10, headerCount: 10, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: hashOf("pp"), virtualDaaScore: DAA, sink });
        case "getInfo":
          return ok({ p2pId: "cuf1b", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getUtxosByAddresses":
          state.utxoReads += 1;
          if (state.failUtxoReads) return err("the UTXO index is not available");
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              (address === payer ? state.entries : []).map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: 0 },
                utxoEntry: { amount: e.sompi, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) }
              }))
            )
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, sending: [], receiving: [] })) });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === payer ? state.entries.reduce((s, e) => s + e.sompi, 0) : 0 })) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); }) };
}

const made: string[] = [];
const fakes: Fake[] = [];
function workspace(url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1b-sdk-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } },
    experimental: true,
    network: { allowPublic: true }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}

/** The signing account, with every read of key material recorded. */
function watchedAccount() {
  const reads: string[] = [];
  const KEY_FIELDS = new Set(["privateKey", "privateKeyEnv", "keystorePath", "keystoreKind", "mnemonic", "seed", "xprv"]);
  const account = new Proxy({ name: "payer", kind: "kaspa", network: "testnet-10", address: payer, privateKey: PAYER_KEY } as any, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && KEY_FIELDS.has(prop)) reads.push(prop);
      return Reflect.get(target, prop, receiver);
    }
  });
  return { account, reads };
}

/** Plan an ordinary payment while the node lists ORDINARY, then let `between` change what the node says, then sign. */
async function planThenSign(between: (state: State, plan: any) => any, opts: { externalSigner?: { calls: number }; signOnSimulator?: boolean } = {}) {
  const state: State = { entries: [{ ...ORDINARY }], failUtxoReads: false, utxoReads: 0 };
  const fake = await startFake(state);
  fakes.push(fake);
  const cwd = workspace(fake.url);
  const planner = await Hardkas.open({ cwd });
  let plan: any;
  try {
    plan = await planner.tx.plan({ from: payer, to: payee, amount: "1" } as any);
  } finally {
    await planner.close();
  }
  const toSign = between(state, plan) ?? plan;
  const readsBeforeSign = state.utxoReads;
  const signer = opts.externalSigner
    ? { signTransaction: async () => { opts.externalSigner!.calls += 1; throw new Error("EXTERNAL_SIGNER_CALLED"); } }
    : undefined;
  // signOnSimulator: a workspace with no configuration runs the simulator (the built-in default target)
  const signCwd = opts.signOnSimulator ? fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1b-sim-")) : cwd;
  if (opts.signOnSimulator) made.push(signCwd);
  const sdk = await Hardkas.open({ cwd: signCwd, ...(signer ? { signer } : {}) } as any);
  const w = watchedAccount();
  try {
    const r = await sdk.tx.sign(toSign, { account: w.account } as any).then((signed: any) => ({ signed, error: undefined as any }), (error: any) => ({ signed: undefined as any, error }));
    return { ...r, keyReads: w.reads, signTimeUtxoReads: state.utxoReads - readsBeforeSign };
  } finally {
    await sdk.close();
  }
}

/** The plan as if written by hand: its input declared a covenant's UTXO, with a binding on an output, identity resealed. */
function declaredCovenant(plan: any): any {
  const copy = JSON.parse(JSON.stringify(plan));
  copy.inputs[0].covenantId = COVENANT_ID;
  copy.outputs[0].covenant = { covenantId: COVENANT_ID, authorizingInput: 0 };
  delete copy.contentHash;
  delete copy.planId;
  return finalizeTxPlanIdentity(copy);
}

beforeAll(() => {
  kaspa = loadManagedKaspaWasmSync();
  payer = new kaspa.PrivateKey(PAYER_KEY).toPublicKey().toAddress("testnet-10").toString();
  payee = new kaspa.PrivateKey(hashOf("cuf1b payee")).toPublicKey().toAddress("testnet-10").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const ORDINARY: Entry = { txid: hashOf("ordinary utxo"), sompi: 50 * KAS };

describe("COVENANT-UTXO-PAYMENT-FILTER-1B · SDK tx.sign checks each input against the node before signing", () => {
  it("CB-S1 control: the node lists the input as an ordinary UTXO; the plan is signed with the account's key", async () => {
    const r = await planThenSign(() => undefined);
    expect(r.error, String(r.error)).toBeUndefined();
    expect(r.signed?.status).toBe("signed");
    expect(r.keyReads.length).toBeGreaterThan(0);
  });

  it("CB-S2 the plan does not mark it, but the node lists the input as a covenant's UTXO: refused, no key read", async () => {
    const r = await planThenSign((state) => { state.entries = [{ ...ORDINARY, covenantId: COVENANT_ID }]; });
    expect(r.error?.code, String(r.error ?? "signed: the plan's silence was trusted")).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(String(r.error?.message)).toContain(COVENANT_ID);
    expect(r.keyReads).toEqual([]);
  });

  it("CB-S3 the plan declares a covenant input with a binding (probe 81 through the SDK): refused, no key read", async () => {
    const r = await planThenSign((_state, plan) => declaredCovenant(plan));
    expect(r.error?.code, String(r.error ?? "signed")).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(r.keyReads).toEqual([]);
  });

  it("CB-S4 the node no longer lists the input unspent: it cannot be checked, so nothing is signed (fail closed)", async () => {
    const r = await planThenSign((state) => { state.entries = []; });
    expect(r.error?.code, String(r.error ?? "signed without a check")).toBe("COVENANT_UTXO_UNVERIFIED");
    expect(r.keyReads).toEqual([]);
  });

  it("CB-S5 the node cannot be asked: nothing is signed (fail closed)", async () => {
    const r = await planThenSign((state) => { state.failUtxoReads = true; });
    expect(r.error?.code, String(r.error ?? "signed without a check")).toBe("COVENANT_UTXO_UNVERIFIED");
    expect(r.keyReads).toEqual([]);
  });

  it("CB-S6 an external signer is never asked to sign a plan that declares a covenant input", async () => {
    const external = { calls: 0 };
    const r = await planThenSign((_state, plan) => declaredCovenant(plan), { externalSigner: external });
    expect(r.error?.code, String(r.error)).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(external.calls).toBe(0);
  });

  it("CB-S7 an external signer is never asked when the node lists the input as a covenant's UTXO", async () => {
    const external = { calls: 0 };
    const r = await planThenSign((state) => { state.entries = [{ ...ORDINARY, covenantId: COVENANT_ID }]; }, { externalSigner: external });
    expect(r.error?.code, String(r.error)).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(external.calls).toBe(0);
  });

  it("CB-S8 an instance of another network (here the simulator) is never asked in the plan's node's place: refused, no key read", async () => {
    const r = await planThenSign(() => undefined, { signOnSimulator: true });
    expect(r.error?.code, String(r.error ?? "signed without asking the plan's node")).toBe("COVENANT_UTXO_UNVERIFIED");
    expect(String(r.error?.message)).toMatch(/testnet-10/);
    expect(r.keyReads).toEqual([]);
    expect(r.signTimeUtxoReads).toBe(0);
  });
});
