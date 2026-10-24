/*
 * LOTE 1B — WalletToolkit · BEFORE tests (diagnosis only, no fix).
 *
 * Every test asserts the SAFE behaviour of WalletToolkit's send paths: nothing is signed or submitted unless the
 * node's identity is positively known, coherent, not mainnet and equal to the toolkit's configured network.
 * A test that FAILS on base bb4da311b documents the defect. In-process fakes only: no network, no real wallet, no
 * funds. Planning (kaspa-wasm Generator), address derivation and UTXO listing are stubbed so the test isolates the
 * guard -> sign -> submit path; the stubs never decide whether a network is allowed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { WalletToolkit } from "../src/index.js";

type Ev = string;

interface FakeOpts {
  /** Successive answers of getBlockDagInfo (last one repeats). A function answer throws. */
  dag?: Array<Record<string, unknown> | (() => never)> | undefined;
  /** getServerInfo answer; omitted = method absent. */
  server?: Record<string, unknown>;
  /** submitTransaction behaviour. */
  submit?: "ok" | "timeout";
  /** remove getBlockDagInfo entirely. */
  noDagMethod?: boolean;
}

function fakeRpc(o: FakeOpts, events: Ev[]) {
  let i = 0;
  const rpc: any = {
    submits: 0,
    async submitTransaction(_tx: unknown) {
      rpc.submits++;
      events.push("submit");
      if (o.submit === "timeout") throw Object.assign(new Error("RPC request submitTransaction timed out after 10ms"), { code: "RPC_TIMEOUT" });
      // v2: a coherent node answers the id of the transaction it was given (the signer's, below)
      return { transactionId: "signed-txid" };
    }
  };
  if (!o.noDagMethod) {
    rpc.getBlockDagInfo = async () => {
      const list = o.dag ?? [{}];
      const a = list[Math.min(i, list.length - 1)];
      i++;
      events.push("dag");
      if (typeof a === "function") a();
      return { virtualDaaScore: 1000n, ...(a as object) };
    };
  }
  if (o.server) {
    rpc.getServerInfo = async () => {
      events.push("server");
      return o.server;
    };
  }
  return rpc;
}

function fakeSigner(events: Ev[]) {
  const s: any = {
    signs: 0,
    async signTxPlan({ planArtifact }: any) {
      s.signs++;
      events.push("sign");
      s.lastArtifactNetwork = planArtifact.networkId;
      return { txId: "signed-txid", signedTransaction: { payload: JSON.stringify({ fake: true }) } };
    }
  };
  return s;
}

const FAKE_PLAN = {
  inputs: [{ outpoint: { transactionId: "aa".repeat(32), index: 0 }, amountSompi: 10_000_000n }],
  outputs: [{ address: "kaspasim:qfakedest", amountSompi: 1_000n }],
  change: undefined,
  estimatedMass: 1000n,
  estimatedFeeSompi: 2000n
};

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lote1b-"));
});
afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

let n = 0;
function makeWallet(network: string | undefined, rpcOpts: FakeOpts, networkId?: string) {
  const events: Ev[] = [];
  const rpc = fakeRpc(rpcOpts, events);
  const signer = fakeSigner(events);
  const w = WalletToolkit.open(`w${++n}`, {
    storePath: path.join(tmp, `w${n}.json`),
    ...(network !== undefined ? { network: network as any } : {}),
    ...(networkId !== undefined ? { networkId } : {}),
    rpc,
    signer,
    coinbaseMaturity: 100n
  });
  vi.spyOn(w, "receive").mockResolvedValue("kaspasim:qfakesource");
  vi.spyOn(w.utxos, "list").mockResolvedValue([
    { outpoint: { transactionId: "aa".repeat(32), index: 0 }, transactionId: "aa".repeat(32), outputIndex: 0, index: 0, amountSompi: 10_000_000n, scriptPublicKey: "00", address: "kaspasim:qfakesource", blockDaaScore: 1n, isCoinbase: false },
    { outpoint: { transactionId: "bb".repeat(32), index: 0 }, transactionId: "bb".repeat(32), outputIndex: 0, index: 0, amountSompi: 20_000_000n, scriptPublicKey: "00", address: "kaspasim:qfakesource", blockDaaScore: 1n, isCoinbase: false }
  ] as any);
  vi.spyOn(w as any, "planUpstream").mockImplementation(async () => {
    events.push("plan");
    return { plan: FAKE_PLAN };
  });
  vi.spyOn(w as any, "planSweep").mockImplementation(async () => {
    events.push("plan");
    return FAKE_PLAN;
  });
  return { w, rpc, signer, events };
}

const send = (w: WalletToolkit) => w.send({ to: "kaspasim:qfakedest", amount: 1_000n, feeRate: 1n });

/** The safe outcome: the call is refused and neither the signer nor submitTransaction is reached. */
async function expectRefusedNothingSent(ctx: ReturnType<typeof makeWallet>, run: () => Promise<unknown>) {
  let threw: unknown;
  try { await run(); } catch (e) { threw = e; }
  const seen = JSON.stringify({ events: ctx.events, signs: ctx.signer.signs, submits: ctx.rpc.submits, threw: String((threw as any)?.code ?? (threw as any)?.message ?? threw) });
  // eslint-disable-next-line no-console
  console.log("[1B]", seen);
  expect(ctx.rpc.submits, seen).toBe(0);
  expect(ctx.signer.signs, seen).toBe(0);
  expect(threw, seen).toBeDefined();
}

const dagThrows = () => { throw new Error("getBlockDagInfo failed: connection reset"); };

describe("LOTE 1B — WalletToolkit network/mainnet guard (BEFORE)", () => {
  it("1B-a getBlockDagInfo throws -> send refused, nothing signed or submitted", async () => {
    const ctx = makeWallet(undefined, { dag: [dagThrows] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-a2 getBlockDagInfo throws -> sweep refused", async () => {
    const ctx = makeWallet(undefined, { dag: [dagThrows] });
    await expectRefusedNothingSent(ctx, () => ctx.w.sweep({ to: "kaspasim:qfakedest", feeRate: 1n }));
  });

  it("1B-a3 getBlockDagInfo throws -> consolidate refused", async () => {
    const ctx = makeWallet(undefined, { dag: [dagThrows] });
    await expectRefusedNothingSent(ctx, () => ctx.w.consolidate({ feeRate: 1n }));
  });

  it("1B-b node answers { network: 'mainnet' } (raw kaspa-wasm RpcClient shape) -> refused", async () => {
    const ctx = makeWallet(undefined, { dag: [{ network: "mainnet" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-b2 node answers { network: 'mainnet' } with toolkit configured testnet -> refused", async () => {
    const ctx = makeWallet("testnet", { dag: [{ network: "mainnet" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-c node answers { networkId: 'mainnet' } (HardKAS client shape) -> refused", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "mainnet" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-d node answers without any network field -> refused", async () => {
    const ctx = makeWallet(undefined, { dag: [{}] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-d2 node answers networkId 'unknown' (what KaspaRpcClient maps a missing name to) -> refused", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "unknown" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-d3 rpc has no getBlockDagInfo at all -> refused (node identity cannot be established)", async () => {
    const ctx = makeWallet(undefined, { noDagMethod: true });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-e toolkit configured testnet, node says simnet -> refused (mismatch)", async () => {
    const ctx = makeWallet("testnet", { dag: [{ networkId: "simnet" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-e2 toolkit configured testnet-10 (cast), node says testnet-11 -> refused (mismatch)", async () => {
    const ctx = makeWallet("testnet-10", { dag: [{ networkId: "testnet-11" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-e3 toolkit default (simnet), node says testnet-10 -> refused (mismatch)", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "testnet-10" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-e4 getServerInfo and getBlockDagInfo disagree (testnet-10 / testnet-11) -> refused", async () => {
    const ctx = makeWallet("testnet-10", { dag: [{ networkId: "testnet-10" }], server: { networkId: "testnet-11" } });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-f toolkit configured 'mainnet' -> refused (at open() or at send), nothing sent", async () => {
    let openErr: any;
    try { makeWallet("mainnet", { dag: [{ networkId: "simnet" }] }); } catch (e) { openErr = e; }
    // eslint-disable-next-line no-console
    console.log("[1B-f]", String(openErr?.message ?? "open() accepted mainnet"));
    // exact "mainnet" is refused by WalletQuery's constructor (packages/query/src/wallet-query.ts:82) before any rpc use
    expect(openErr).toBeDefined();
  });

  it("1B-f2 toolkit configured 'kaspa-mainnet' (cast; passes WalletQuery's exact-string check), getBlockDagInfo throws -> refused", async () => {
    const ctx = makeWallet("kaspa-mainnet", { dag: [dagThrows] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-f3 toolkit configured 'Mainnet' (cast), node says simnet -> refused", async () => {
    const ctx = makeWallet("Mainnet", { dag: [{ networkId: "simnet" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  // AFTER (P0-TX-SAFETY-1B, owner decision 2026-10-18): a spend needs a DECLARED network and BOTH identity answers. The
  // scenarios that describe a LEGITIMATE send (g, g2, g3, h, i) are therefore set up legitimately — networkId declared,
  // getServerInfo present — and keep their assertions; their former undeclared set-up is now a refusal (1B-u*).
  it("1B-g order: an identity read precedes signing, and the last read before submit is after planning", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "simnet" }], server: { networkId: "simnet" } }, "simnet");
    await send(ctx.w);
    // eslint-disable-next-line no-console
    console.log("[1B-g order]", ctx.events.join(" > "));
    const firstDag = ctx.events.indexOf("dag");
    const sign = ctx.events.indexOf("sign");
    const submit = ctx.events.indexOf("submit");
    const lastDagBeforeSign = ctx.events.slice(0, sign).lastIndexOf("dag");
    expect(firstDag).toBeGreaterThanOrEqual(0);
    expect(firstDag).toBeLessThan(sign);
    expect(lastDagBeforeSign).toBeGreaterThan(ctx.events.indexOf("plan"));
    expect(sign).toBeLessThan(submit);
  });

  it("1B-g2 node turns mainnet between the first read and the pre-sign read -> refused", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "simnet" }, { networkId: "simnet" }, { networkId: "mainnet" }], server: { networkId: "simnet" } }, "simnet");
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-g3 node turns mainnet (kaspa-wasm `network` shape) at the pre-sign read -> refused", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "simnet" }, { networkId: "simnet" }, { network: "mainnet" }], server: { networkId: "simnet" } }, "simnet");
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-h submit times out -> error surfaces, exactly one submitTransaction (no blind resubmit)", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "simnet" }], server: { networkId: "simnet" }, submit: "timeout" }, "simnet");
    let threw: any;
    try { await send(ctx.w); } catch (e) { threw = e; }
    // eslint-disable-next-line no-console
    console.log("[1B-h]", JSON.stringify({ submits: ctx.rpc.submits, threw: String(threw?.code ?? threw?.message) }));
    expect(threw).toBeDefined();
    expect(ctx.rpc.submits).toBe(1);
    // never "not sent" after the request may have left
    expect(threw?.code).toBe("WALLET_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("1B-u former undeclared set-up of g/h/i (no networkId, no getServerInfo) -> refused, nothing signed", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "simnet" }] });
    await expectRefusedNothingSent(ctx, () => send(ctx.w));
  });

  it("1B-i signer receives the node's network in the plan artifact, not a defaulted 'simnet'", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "testnet-10" }], server: { networkId: "testnet-10" } }, "testnet-10");
    await send(ctx.w);
    expect(ctx.signer.signs).toBe(1);
    // eslint-disable-next-line no-console
    console.log("[1B-i]", JSON.stringify({ signs: ctx.signer.signs, artifactNetwork: ctx.signer.lastArtifactNetwork }));
    if (ctx.signer.signs > 0) expect(ctx.signer.lastArtifactNetwork).toBe("testnet-10");
  });
});

describe("LOTE 1B — deprecated stubs (documentation only)", () => {
  it("DOC-1 planSend returns a stub message, no plan", async () => {
    const ctx = makeWallet(undefined, { dag: [{ networkId: "simnet" }] });
    const r = await ctx.w.planSend({ to: "kaspasim:qfakedest", amount: 1n });
    // eslint-disable-next-line no-console
    console.log("[DOC-1]", JSON.stringify(r));
    expect(r).toHaveProperty("message");
    expect(String(r.message)).toMatch(/stub/i);
    expect(ctx.events).toEqual([]);
  });

  it("DOC-2 sendSimulated returns sim_tx_<timestamp>, touches no rpc/signer/state", async () => {
    const ctx = makeWallet("kaspa-mainnet", { dag: [{ network: "mainnet" }] });
    const r = await ctx.w.sendSimulated({ to: "kaspa:qfakedest", amount: 1n });
    // eslint-disable-next-line no-console
    console.log("[DOC-2]", r, JSON.stringify(ctx.events));
    expect(r).toMatch(/^sim_tx_\d+$/);
    expect(ctx.events).toEqual([]);
    expect(ctx.rpc.submits).toBe(0);
  });
});
