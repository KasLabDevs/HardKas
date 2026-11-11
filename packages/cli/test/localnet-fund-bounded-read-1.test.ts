import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCoinbaseMaturity } from "@hardkas/core";
import { fakeOfficialRpc, type FakeOfficialRpc } from "../../kaspa-rpc/test/helpers/fake-official-rpc.js";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 60_000 });

// LOCALNET-FUND-BOUNDED-READ-1 (seen 2026-11-11 on 0.13.0-rc.2 with a 7.9 GB simnet chain, and 2026-10-21 with 10.66 GB,
// about 1.34 M UTXOs): `localnet fund` read EVERY UTXO of the funded address just to compute its total and mature
// balance, through a client with a fixed 10 s timeout. On a localnet that has mined to that address for a long time
// (the miner's own account, `--keep-miner`), the read of its coinbase UTXOs does not finish in time and fund fails with
// `RPC_TIMEOUT — RPC request getUtxosByAddresses timed out after 10000ms` before any funding starts. The later steps
// (the SDK wait, the settle phase) read the same full set too.
//
// The node here is a stand-in official client (no network) behind the REAL JsonWrpcKaspaClient, so the real session
// timeouts apply. It models a long-mined simnet: 1,341,858 coinbase outputs of 50 KAS at the funded address, one per
// chain block, and a getUtxosByAddresses that never answers within the timeout (what a read of 1.34 M entries does).
// Funding must not depend on that read: the total comes from getBalancesByAddresses (one number) and the immature part
// from the chain blocks of the coinbase-maturity window only (getBlock), so the cost no longer grows with the UTXO count.

const h = vi.hoisted(() => ({
  RECIPIENT: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn",
  node: null as any,
  sdkWaitCalls: 0
}));

const KAS = 100_000_000n;
const REWARD = 50n * KAS;
const MATURITY = getCoinbaseMaturity("simnet");
const START_HEIGHT = 1_341_858;
/** Blocks the fake node adds per DAG read while the miner runs (a throttled simnet miner between two polls). */
const STEP = 700;

const hashOf = (i: number) => "c" + i.toString(16).padStart(63, "0");
const heightOf = (hash: string) => (/^c[0-9a-f]{63}$/.test(hash) ? parseInt(hash.slice(1), 16) : -1);

/**
 * A linear simnet chain: block i has DAA score i; the coinbase in block i pays REWARD to `payee(i)` (block 0, the
 * genesis, pays nothing). As on rusty-kaspa, a chain block accepts its selected parent's coinbase at its own DAA score,
 * and the virtual accepts the sink's, at the virtual DAA score (sink + 1).
 */
function longMinedNode(address: string) {
  const segments: Array<{ from: number; payee: string }> = [{ from: 1, payee: address }];
  const state = { height: START_HEIGHT, miner: null as string | null };
  const payeeOf = (i: number) => {
    if (i <= 0) return null;
    let p: string | null = null;
    for (const s of segments) if (s.from <= i) p = s.payee;
    return p;
  };
  const paidTo = (addr: string, upTo: number) => {
    let total = 0n;
    for (let k = 0; k < segments.length; k++) {
      const s = segments[k]!;
      const end = Math.min(upTo, (segments[k + 1]?.from ?? Infinity) - 1);
      if (s.payee === addr && end >= s.from) total += BigInt(end - s.from + 1) * REWARD;
    }
    return total;
  };
  const advanceIfMining = () => {
    if (!state.miner) return;
    if (payeeOf(state.height + 1) !== state.miner) segments.push({ from: state.height + 1, payee: state.miner });
    state.height += STEP;
  };
  const virtualDaa = () => BigInt(state.height + 1);
  const block = (i: number, includeTransactions: boolean) => {
    const payee = payeeOf(i);
    const coinbase = {
      version: 0,
      inputs: [],
      outputs: payee
        ? [{ value: REWARD, scriptPublicKey: { version: 0, script: "20" + "ab".repeat(32) + "ac" }, verboseData: { scriptPublicKeyType: "pubkey", scriptPublicKeyAddress: payee } }]
        : [],
      lockTime: 0n,
      subnetworkId: "0100000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      verboseData: { transactionId: "d" + i.toString(16).padStart(63, "0"), hash: "", computeMass: 0n, blockHash: hashOf(i), blockTime: 0n }
    };
    return {
      block: {
        header: { hash: hashOf(i), version: 1, parentsByLevel: i > 0 ? [[hashOf(i - 1)]] : [], daaScore: BigInt(i), blueScore: BigInt(i), timestamp: 1792088193138n + BigInt(i) },
        transactions: includeTransactions ? [coinbase] : [],
        verboseData: { hash: hashOf(i), selectedParentHash: i > 0 ? hashOf(i - 1) : "fe".repeat(32), isChainBlock: true, mergeSetBluesHashes: i > 0 ? [hashOf(i - 1)] : [], mergeSetRedsHashes: [] }
      }
    };
  };
  const fake: FakeOfficialRpc = fakeOfficialRpc({
    getServerInfo: () => ({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: virtualDaa() }),
    getInfo: () => ({ p2pId: "fake", mempoolSize: 0n, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true }),
    getBlockDagInfo: () => {
      advanceIfMining();
      const sink = hashOf(state.height);
      return { network: "simnet", blockCount: BigInt(state.height + 1), headerCount: BigInt(state.height + 1), tipHashes: [sink], difficulty: 1, pastMedianTime: 0n, virtualParentHashes: [sink], pruningPointHash: hashOf(0), virtualDaaScore: virtualDaa(), sink };
    },
    getBalancesByAddresses: (req: any) => ({ entries: (req?.addresses ?? []).map((a: string) => ({ address: a, balance: paidTo(a, state.height) })) }),
    getBalanceByAddress: (req: any) => ({ balance: paidTo(String(req?.address), state.height) }),
    // 1.34 M entries: the answer does not arrive within any timeout the old code had
    getUtxosByAddresses: () => new Promise(() => {}),
    getBlock: (req: any) => {
      const i = heightOf(String(req?.hash));
      if (i < 0 || i > state.height) throw new Error("RPC Server (remote error) -> code:0  message:`block not found` data:None");
      return block(i, Boolean(req?.includeTransactions));
    }
  });
  /** What the node's UTXO index holds for `addr` right now, classified as the node does (V − blockDaaScore ≥ maturity). */
  const truth = (addr: string) => {
    const V = virtualDaa();
    let mature = 0n;
    for (let k = 0; k < segments.length; k++) {
      const s = segments[k]!;
      if (s.payee !== addr) continue;
      // the coinbase in block i is accepted at DAA i + 1 (by block i + 1, or by the virtual for the sink)
      const lastMature = Math.min(state.height, (segments[k + 1]?.from ?? Infinity) - 1, Number(V - MATURITY) - 1);
      if (lastMature >= s.from) mature += BigInt(lastMature - s.from + 1) * REWARD;
    }
    return { balanceSompi: paidTo(addr, state.height), matureBalanceSompi: mature, virtualDaaScore: V.toString() };
  };
  const calls = (method: string) => fake.calls.filter((c) => c.method === method).length;
  return { fake, state, truth, calls, setMiner: (a: string | null) => (state.miner = a) };
}

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    if (args[0] === "inspect") return { stdout: "running|kaspanet/cpuminer@sha256:test|/hardkas-toccata-miner" };
    if (args[0] === "run") h.node?.setMiner(args[args.indexOf("-a") + 1] ?? null);
    if (args[0] === "stop" || args[0] === "rm") h.node?.setMiner(null);
    return { stdout: "" };
  })
}));
vi.mock("@hardkas/node-runner", () => ({
  requireNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  verifyNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  DockerKaspadRunner: class {}
}));
vi.mock("@hardkas/config", async (orig) => ({ ...(await orig<any>()), loadHardkasConfig: vi.fn(async () => ({ config: {} })) }));
vi.mock("@hardkas/accounts", async (orig) => ({
  ...(await orig<any>()),
  resolveHardkasAccount: vi.fn(() => ({ name: "miner", kind: "kaspa", network: "simnet", address: h.RECIPIENT }))
}));
// The REAL client (session, timeouts, result mapping), connected to the stand-in node instead of a socket.
vi.mock("@hardkas/kaspa-rpc", async (orig) => {
  const real = await orig<any>();
  class OnFakeNode extends real.JsonWrpcKaspaClient {
    constructor(options: any) {
      super({ ...options, rpcFactory: (url: string) => h.node.fake.factory(url) });
    }
  }
  return { ...real, JsonWrpcKaspaClient: OnFakeNode };
});
// The SDK fund opens: its rpc is the same real client on the same node. Its waitForSpendableFunding reads every UTXO
// of the address on each poll; it is counted here, never used for the answer.
vi.mock("@hardkas/sdk", async () => {
  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  return {
    Hardkas: {
      create: vi.fn(async () => {
        const rpc = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });
        return {
          rpc,
          utxos: {
            waitForSpendableFunding: vi.fn(async () => {
              h.sdkWaitCalls++;
              await rpc.getUtxosByAddress(h.RECIPIENT);
            })
          },
          close: vi.fn(async () => rpc.close())
        };
      })
    }
  };
});

import { runLocalnetFund } from "../src/runners/localnet-runners.js";
import { setGlobalOutput } from "../src/output.js";

let printed: string[];

beforeEach(() => {
  h.node = longMinedNode(h.RECIPIENT);
  h.sdkWaitCalls = 0;
  printed = [];
  setGlobalOutput({
    writeLine: (s: string) => printed.push(s),
    writeJson: (o: unknown) => printed.push(JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))
  } as any);
});

describe("LOCALNET-FUND-BOUNDED-READ-1 · localnet fund on a localnet that has mined to the address for a long time", () => {
  it("funds an address holding 1,341,858 coinbase UTXOs: no full UTXO read, exact total and mature balance, same JSON fields", async () => {
    const node = h.node as ReturnType<typeof longMinedNode>;
    const expectedBefore = node.truth(h.RECIPIENT);
    const startedAt = Date.now();

    await runLocalnetFund({ identifier: "miner", amountSompi: 1000n * KAS, json: true });

    const payload = JSON.parse(printed.at(-1)!);
    const expectedAfter = node.truth(h.RECIPIENT);
    expect(payload.status).toBe("TOCCATA_ACCOUNT_FUNDED");
    expect(payload.address).toBe(h.RECIPIENT);
    // the same fields as before the fix, in the same order
    for (const side of ["before", "after"]) {
      expect(Object.keys(payload[side]), side).toEqual(["balanceSompi", "matureBalanceSompi", "utxoCount", "matureUtxoCount", "virtualDaaScore"]);
    }
    // the balances are the node's own, to the sompi, before and after
    expect(payload.before).toMatchObject({
      balanceSompi: expectedBefore.balanceSompi.toString(),
      matureBalanceSompi: expectedBefore.matureBalanceSompi.toString(),
      virtualDaaScore: expectedBefore.virtualDaaScore
    });
    expect(payload.after).toMatchObject({
      balanceSompi: expectedAfter.balanceSompi.toString(),
      matureBalanceSompi: expectedAfter.matureBalanceSompi.toString(),
      virtualDaaScore: expectedAfter.virtualDaaScore
    });
    expect(BigInt(payload.after.matureBalanceSompi) - BigInt(payload.before.matureBalanceSompi)).toBeGreaterThanOrEqual(1000n * KAS);
    expect(BigInt(payload.before.balanceSompi)).toBe(BigInt(START_HEIGHT) * REWARD);

    // the read that cannot finish is never asked for, by fund or by the SDK wait it used to call
    expect(node.calls("getUtxosByAddresses")).toBe(0);
    expect(h.sdkWaitCalls).toBe(0);
    // bounded work: the blocks of the maturity window plus the blocks mined meanwhile, each read once
    const mined = node.state.height - START_HEIGHT;
    expect(node.calls("getBlock")).toBeLessThanOrEqual(Number(MATURITY) + 10 + mined + 5);
    expect(Date.now() - startedAt).toBeLessThan(60_000);
  });

  it("--keep-miner while the miner is already mining to the address: completes, never reads every UTXO, keeps mining", async () => {
    const node = h.node as ReturnType<typeof longMinedNode>;
    node.setMiner(h.RECIPIENT);

    await runLocalnetFund({ identifier: "miner", amountSompi: 1000n * KAS, json: true, keepMiner: true });

    const payload = JSON.parse(printed.at(-1)!);
    expect(payload.status).toBe("TOCCATA_ACCOUNT_FUNDED");
    expect(BigInt(payload.after.matureBalanceSompi) - BigInt(payload.before.matureBalanceSompi)).toBeGreaterThanOrEqual(1000n * KAS);
    // never above what the node holds as mature at the end
    expect(BigInt(payload.after.matureBalanceSompi)).toBeLessThanOrEqual(node.truth(h.RECIPIENT).matureBalanceSompi);
    expect(node.calls("getUtxosByAddresses")).toBe(0);
    expect(h.sdkWaitCalls).toBe(0);
    expect(node.state.miner).toBe(h.RECIPIENT);
  });
});
