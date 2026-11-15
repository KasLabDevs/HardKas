import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyArtifactOnNetwork, type ArtifactNetworkSubject } from "../src/artifact-network-verify.js";

// R3-D · `artifact verify --address`: a transaction whose output was spent since is no longer in the node's UTXO set;
// before the pruning point's genesis-less window it was NOT_OBSERVABLE_HERE (RC1-R2). The history of an address it
// pays (a bounded window of the selected chain, getVirtualChainFromBlockV2) locates its acceptance; the look then starts
// at the chain block before it and the acceptance is the look's own chain answer. A window that does not reach back
// stays NOT_OBSERVABLE_HERE and names the window read, never NOT_FOUND. Scripted node; nothing is sent.

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const ADDR = "kaspatest:qra97q5zuevchu7w45mkjte5qa7saelqw3nfy2rljqjhkz0ngwk7vh34ldcsy";
const OTHER = "kaspatest:qzspdj2hsje4e0qcekc29z5c73j9k5nfc0set3zevfazf0262y2vv0vgf0t32";
const BLUE0 = 1_000_000;
const DAA0 = 3_000_000;

function scriptedNode(label: string, o: { tip: number; pruningAt: number; accepted: Record<string, number>; noV2?: boolean }) {
  const hashOf = (i: number) => sha(`r3d-v-${label}-${i}`);
  const index = new Map<string, number>();
  for (let i = 0; i <= o.tip; i++) index.set(hashOf(i), i);
  const acceptedAt = new Map<number, string[]>();
  for (const [tx, at] of Object.entries(o.accepted)) acceptedAt.set(at, [...(acceptedAt.get(at) ?? []), tx]);
  const header = (i: number) => ({ hash: hashOf(i), parentsByLevel: i > 0 ? [[hashOf(i - 1)]] : [], blueScore: BLUE0 + i, daaScore: DAA0 + 2 * i });
  const calls: string[] = [];
  const client: any = {
    async call(method: string, params: any) {
      calls.push(method);
      switch (method) {
        case "getServerInfo":
          return { networkId: "testnet-10", serverVersion: "2.1.0", isSynced: true };
        case "getBlockDagInfo":
          return { network: "testnet-10", virtualDaaScore: DAA0 + 2 * o.tip + 1, sink: hashOf(o.tip), pruningPointHash: hashOf(o.pruningAt) };
        case "getSinkBlueScore":
          return { blueScore: BLUE0 + o.tip };
        case "getMempoolEntry":
          throw new Error(`Transaction ${params?.transactionId} not found`);
        case "getBlock": {
          const i = index.get(params?.hash);
          if (i === undefined || i < o.pruningAt - 50) throw new Error(`cannot find header ${params?.hash}`);
          return { block: { header: header(i), verboseData: { selectedParentHash: i > 0 ? hashOf(i - 1) : "fe".repeat(32) } } };
        }
        case "getVirtualChainFromBlock": {
          const i = index.get(params?.startHash);
          if (i === undefined || i < o.pruningAt) throw new Error(`cannot find header ${params?.startHash}`);
          const added: string[] = [];
          const accepted: unknown[] = [];
          // the node's batch: 500 chain blocks per answer
          for (let j = i + 1; j <= Math.min(o.tip, i + 500); j++) {
            added.push(hashOf(j));
            accepted.push({ acceptingBlockHash: hashOf(j), acceptedTransactionIds: [sha(`cb-${j}`), ...(acceptedAt.get(j) ?? [])] });
          }
          return { removedChainBlockHashes: [], addedChainBlockHashes: added, acceptedTransactionIds: accepted };
        }
        case "getVirtualChainFromBlockV2": {
          if (o.noV2) throw new Error("Kaspa RPC method not found: getVirtualChainFromBlockV2");
          expect(params.dataVerbosityLevel).toBe("High");
          const i = index.get(params?.startHash);
          if (i === undefined || i < o.pruningAt) throw new Error(`cannot find header ${params?.startHash}`);
          const added: string[] = [];
          const accepted: unknown[] = [];
          for (let j = i + 1; j <= o.tip; j++) {
            added.push(hashOf(j));
            accepted.push({
              chainBlockHeader: header(j),
              acceptedTransactions: (acceptedAt.get(j) ?? []).map((t) => ({
                inputs: [{ previousOutpoint: { transactionId: sha("funding"), index: 0 }, verboseData: { utxoEntry: { amount: 1000, verboseData: { scriptPublicKeyAddress: OTHER } } } }],
                outputs: [{ value: 300, verboseData: { scriptPublicKeyAddress: ADDR } }],
                verboseData: { transactionId: t }
              }))
            });
          }
          return { removedChainBlockHashes: [], addedChainBlockHashes: added, chainBlockAcceptedTransactions: accepted };
        }
        default:
          throw new Error(`scripted node does not implement ${method}`);
      }
    },
    async getServerInfo() {
      calls.push("getServerInfo");
      return { networkId: "testnet-10", serverVersion: "2.1.0", isSynced: true };
    },
    async getSinkBlueScore() {
      calls.push("getSinkBlueScore");
      return { blueScore: BLUE0 + o.tip };
    },
    async getUtxosByAddresses() {
      calls.push("getUtxosByAddresses");
      // the output was spent since: the UTXO set no longer holds it
      return { entries: [] };
    }
  };
  return { client, hashOf, calls };
}

const node: any = {
  schema: "hardkas.networkIdentity.v1",
  family: "testnet",
  networkId: "testnet-10",
  observedNetworkId: "testnet-10",
  endpoint: "ws://127.0.0.1:1",
  nodeType: "rusty-kaspad",
  evidence: { kind: "endpoint", serverVersion: "2.1.0" },
  sync: "synced",
  trust: "node-endpoint",
  problems: []
};

const signed = (txId: string): ArtifactNetworkSubject => ({
  schema: "hardkas.signedTx",
  networkId: "testnet-10",
  family: "testnet",
  txId,
  simulated: false,
  outputs: [{ address: ADDR, transactionId: txId, amountSompi: "300" }]
});

describe("R3-D · verifyArtifactOnNetwork with the --address lookup", () => {
  it("V-1 without it: a spent output of an acceptance the look's window starts after is NOT_OBSERVABLE_HERE; with it, NETWORK_OBSERVED by the look's own chain answer", async () => {
    const txId = sha("v1-tx");
    // the pruning point (200) is not the genesis and the scan's batch bound stops it before 1260
    const before = scriptedNode("v1", { tip: 1300, pruningAt: 200, accepted: { [txId]: 1260 } });
    const plain = await verifyArtifactOnNetwork({ subject: signed(txId), client: before.client, node, maxBatches: 1 });
    expect(plain.network).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE" });
    expect(plain.network.causes).toEqual(expect.arrayContaining(["OUTPUTS_SPENT_OR_ABSENT"]));
    expect(plain.network.addressLookup).toBeUndefined();

    const n = scriptedNode("v1", { tip: 1300, pruningAt: 200, accepted: { [txId]: 1260 } });
    const r = await verifyArtifactOnNetwork({ subject: signed(txId), client: n.client, node, maxBatches: 1, addressLookup: { address: ADDR } });
    expect(r.network).toMatchObject({ level: "NETWORK_OBSERVED", observation: { source: "virtual-chain", acceptingBlockHash: n.hashOf(1260) } });
    expect(r.network.observation?.scope).toMatch(new RegExp(`located through the history of ${ADDR}`));
    expect(r.network.addressLookup).toMatchObject({ address: ADDR, found: true, acceptingBlockHash: n.hashOf(1260), cursor: n.hashOf(1259), window: { reachedTip: true } });
    expect(r.consensus.level).toBe("NOT_CONFIRMED"); // 40 blue below the policy's 100
    expect(n.calls.filter((c) => /submit/i.test(c))).toEqual([]);
  });

  it("V-2 a history window that does not reach back: NOT_OBSERVABLE_HERE, naming the window read, never NOT_FOUND", async () => {
    const txId = sha("v2-tx");
    const n = scriptedNode("v2", { tip: 1300, pruningAt: 200, accepted: { [txId]: 1100 } });
    const r = await verifyArtifactOnNetwork({ subject: signed(txId), client: n.client, node, maxBatches: 1, addressLookup: { address: ADDR, lookback: 50 } });
    expect(r.network).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE" });
    expect(r.network.addressLookup).toMatchObject({ found: false, window: { chainBlocks: 50, reachedTip: true, startsAtPruningPoint: false } });
    expect(r.network.message).toMatch(/does not show it either in the window it read/);
    expect(r.consensus.reason).toBe("NOT_OBSERVABLE_HERE");
  });

  it("V-3 a node that does not serve the history: the lookup's error is reported and the verification is the one made without it", async () => {
    const txId = sha("v3-tx");
    const n = scriptedNode("v3", { tip: 1300, pruningAt: 200, accepted: { [txId]: 1260 }, noV2: true });
    const r = await verifyArtifactOnNetwork({ subject: signed(txId), client: n.client, node, maxBatches: 1, addressLookup: { address: ADDR } });
    expect(r.network.reason).toBe("NOT_OBSERVABLE_HERE");
    expect(r.network.addressLookup).toMatchObject({ found: false });
    expect(r.network.addressLookup?.error).toMatch(/ADDRESS_HISTORY_NODE_UNSUPPORTED/);
    expect(r.network.message).toMatch(/--address lookup .* could not be made/);
  });
});
