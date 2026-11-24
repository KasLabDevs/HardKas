import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { RpcConnectionError, RpcResponseTooLargeError } from "@hardkas/kaspa-rpc";
import * as waitRunner from "../src/runners/tx-wait-runner.js";
import { sendAsRpc } from "../../sdk/test/helpers/rpc-instance.js";
import { reissueAsBroadcastable, nodeNamesReceived } from "../../sdk/test/helpers/official-signed-payload.js";

const { runTxWait } = waitRunner;

// -----------------------------------------------------------------------------
// RPC-RESPONSE-TOO-LARGE-1 · `tx wait` (LFU §3, 21-oct-2026): after the chain observations reach the target, the wait
// reads the UTXO view of every address the plan pays AND of the sender, on every look. A sender holding more than
// about 277,000 UTXOs (the miner's account on a long-mined localnet) cannot have its list read in one RPC message, so
// every look failed and a CONFIRMED transaction ended TX_WAIT_UTXO_VIEW_STALE (exit 1) — reading the huge list again on
// each look. Owner decision (21-nov): never fail a transaction the chain evidence shows accepted or confirmed only
// because a view is too large to read. Now such an address is read ONCE, left out of the view (`tooLargeToRead`) and the
// rest is checked as before; with nothing readable left the view is "not checked: too large to read" and the state is
// the chain's. Every other failure ends the wait as before. Scripted node (the SDK's real observer and artifacts).
// -----------------------------------------------------------------------------

const H = (n: number) => n.toString(16).padStart(64, "0");

class FakeNode {
  sinkBlueScore = 1000n;
  virtualDaaScore = 5000n;
  pruningPointHash = H(1);
  chain: Array<{ hash: string; blueScore: bigint; daaScore: bigint; accepted: string[] }> = [{ hash: H(1), blueScore: 1n, daaScore: 1n, accepted: [] }];
  /** The node's UTXO index: outpoint (`txId:index`) → the address it pays. */
  index = new Map<string, string>();
  /** Addresses whose UTXO list is larger than the 100 MiB a message may carry. */
  tooLarge = new Set<string>();
  /** Addresses whose read fails for another reason (the node dropped the connection). */
  failing = new Set<string>();
  reads = new Map<string, number>();
  utxosByAddress(address: string) {
    this.reads.set(address, (this.reads.get(address) ?? 0) + 1);
    if (this.tooLarge.has(address)) throw new RpcResponseTooLargeError({ method: "getUtxosByAddresses", endpoint: "ws://127.0.0.1:16110" });
    if (this.failing.has(address)) throw new RpcConnectionError("Connection to Kaspa RPC at ws://127.0.0.1:16110 was lost: RPC Server (remote error) -> WebSocket disconnected");
    return [...this.index]
      .filter(([, owner]) => owner === address)
      .map(([key]) => ({
        outpoint: { transactionId: key.split(":")[0]!, index: Number(key.split(":")[1]) },
        address,
        amountSompi: 100_000_000n,
        scriptPublicKey: "20" + "00".repeat(32) + "ac",
        blockDaaScore: 5000n,
        isCoinbase: false
      }));
  }
  get sink() {
    return this.chain[this.chain.length - 1]!.hash;
  }
  call(method: string, params: any): any {
    switch (method) {
      case "getBlockDagInfo":
        return { networkName: "simnet", virtualDaaScore: this.virtualDaaScore.toString(), sink: this.sink, pruningPointHash: this.pruningPointHash };
      case "getMempoolEntry":
        throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
      case "getVirtualChainFromBlock": {
        const idx = this.chain.findIndex((b) => b.hash === params.startHash);
        if (idx < 0) throw Object.assign(new Error(`block ${params.startHash} not found`), { code: "RPC_NOT_FOUND" });
        const added = this.chain.slice(idx + 1);
        return {
          removedChainBlockHashes: [],
          addedChainBlockHashes: added.map((b) => b.hash),
          acceptedTransactionIds: added.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted }))
        };
      }
      case "getBlock": {
        const b = this.chain.find((x) => x.hash === params.hash);
        if (!b) throw Object.assign(new Error("block not found"), { code: "RPC_NOT_FOUND" });
        return { block: { header: { blueScore: b.blueScore.toString(), daaScore: b.daaScore.toString() } } };
      }
      default:
        throw new Error(`unscripted rpc ${method}`);
    }
  }
}

const keyOf = (o: { transactionId: string; index: number }) => `${o.transactionId}:${Number(o.index)}`;
const paysOf = (plan: any): string[] => [...plan.outputs.map((o: any) => o.address), ...(plan.change ? [plan.change.address] : [])];

describe("RPC-RESPONSE-TOO-LARGE-1 · `tx wait` when an address's UTXO list is too large to read", () => {
  let ws: string;
  let sdk: any;
  let node: FakeNode;
  let blocks = 10;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-twtl1-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    node = new FakeNode();
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: string) => node.utxosByAddress(address) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  async function realSend(): Promise<{ txId: string; plan: any }> {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed: any = await sdk.tx.sign(plan, "alice");
    const s: any = reissueAsBroadcastable(signed, plan);
    await sdk.artifacts.write(s);
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(nodeNamesReceived as any);
    const sent: any = await sendAsRpc(sdk, s, "http://127.0.0.1:16110");
    expect(sent.submitted).toBe(true);
    return { txId: s.txId, plan };
  }
  const indexApplies = (txId: string, plan: any) => {
    for (const i of plan.inputs) node.index.delete(keyOf(i.outpoint));
    paysOf(plan).forEach((address, k) => node.index.set(`${txId}:${k}`, address));
  };
  const confirm = (txId: string) => {
    node.sinkBlueScore += 1n;
    node.virtualDaaScore += 1n;
    node.chain.push({ hash: H(++blocks), blueScore: node.sinkBlueScore, daaScore: node.virtualDaaScore, accepted: [txId] });
    node.sinkBlueScore += 120n;
    node.virtualDaaScore += 120n;
  };
  /** A bounded wait on a virtual clock (3 s, a look per second). */
  const boundedWait = (txId: string) => {
    let t = 0;
    return runTxWait({ txId, sdk, until: "confirmed", timeoutMs: 3_000, intervalMs: 1_000, now: () => t, sleep: async (ms) => void (t += ms) }).catch((e) => e);
  };

  it("TW-1 the sender's list is too large, the recipient lists the output: CONFIRMED, exit 0, the sender named as not checked and read once (it ended TX_WAIT_UTXO_VIEW_STALE)", async () => {
    const { txId, plan } = await realSend();
    const sender = plan.from.address;
    confirm(txId);
    indexApplies(txId, plan);
    node.tooLarge.add(sender);
    const r: any = await boundedWait(txId);
    expect(r?.code, String(r?.message)).toBeUndefined();
    expect(r.outcome).toBe("reached");
    expect(r.derived.status).toBe("CONFIRMED");
    expect(r.utxoView).toMatchObject({ checked: true, converged: true, missingOutputsFor: [], inputsStillListed: [], tooLargeToRead: [sender] });
    expect(r.utxoView.reason).toMatch(/too large to read/);
    expect(r.utxoView.reason).toMatch(/RPC_RESPONSE_TOO_LARGE/);
    expect(waitRunner.utxoViewRow(r.utxoView)).toMatch(/where it could be read/);
    expect(node.reads.get(sender)).toBe(1);
  });

  it("TW-2 every address the view needs is too large to read: the state from the chain alone, the view 'not checked: too large to read'", async () => {
    const { txId, plan } = await realSend();
    confirm(txId);
    indexApplies(txId, plan);
    for (const a of [plan.from.address, ...paysOf(plan)]) node.tooLarge.add(a);
    const r: any = await boundedWait(txId);
    expect(r?.code, String(r?.message)).toBeUndefined();
    expect(r.outcome).toBe("reached");
    expect(r.derived.status).toBe("CONFIRMED");
    expect(r.utxoView).toMatchObject({ checked: false, converged: false });
    expect(new Set(r.utxoView.tooLargeToRead)).toEqual(new Set([plan.from.address, ...paysOf(plan)]));
    expect(waitRunner.utxoViewRow(r.utxoView)).toMatch(/^not checked: too large to read: /);
    for (const a of new Set([plan.from.address, ...paysOf(plan)])) expect(node.reads.get(a), a).toBe(1);
  });

  it("TW-3 the sender's list is too large and the recipient does NOT list the output yet: still TX_WAIT_UTXO_VIEW_STALE, the huge list read once in the whole wait", async () => {
    const { txId, plan } = await realSend();
    const sender = plan.from.address;
    confirm(txId);
    // the index has not applied the tx: nothing of it is listed for the recipient
    node.tooLarge.add(sender);
    const r: any = await boundedWait(txId);
    expect(r?.code, String(r?.message)).toBe("TX_WAIT_UTXO_VIEW_STALE");
    expect(r.message).toMatch(/too large to read/);
    expect(node.reads.get(sender)).toBe(1);
    expect(node.reads.get(plan.outputs[0].address)!).toBeGreaterThan(1);
  });

  it("TW-4 control · the sender's read fails for another reason (connection lost): TX_WAIT_UTXO_VIEW_STALE as before, nothing left out", async () => {
    const { txId, plan } = await realSend();
    confirm(txId);
    indexApplies(txId, plan);
    node.failing.add(plan.from.address);
    const r: any = await boundedWait(txId);
    expect(r?.code, String(r?.message)).toBe("TX_WAIT_UTXO_VIEW_STALE");
    expect(r.message).toMatch(/RPC_CONNECTION_FAILED/);
    expect(r.message).not.toMatch(/too large/);
  });
});
