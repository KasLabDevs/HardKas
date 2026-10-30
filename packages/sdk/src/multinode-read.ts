import { HardkasError, redactUrlCredentials, redactUrlCredentialsInText, systemRuntimeContext } from "@hardkas/core";
import { deriveObserverId, type TxObservation } from "@hardkas/artifacts";
import { canonicalNetworkId, rpcEndpointOf, type KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { v1NodeUtxoOf } from "@hardkas/accounts";
import { observeTxOnce, rpcObserverFor } from "./tx-observer.js";

/*
 * MULTINODE-READ-1 · several nodes read side by side, never written to. Each node is identified (the network it says it
 * serves, its sync flag, its virtual DAA score, sink and UTXO index), placed against the most advanced node of the set
 * (lag), and asked the same questions: the UTXOs of some addresses, what it sees of a transaction (the SDK's observer,
 * one look per node). Answers are compared outpoint by outpoint and node by node; a difference a node's lag can account
 * for is reported as lag, any other one as a disagreement. Nothing decides which node is right: agreement among nodes is
 * not consensus validation (a majority of nodes does not decide what consensus accepted), and no answer is ever turned
 * into a write: this module has no submission, no failover of a send and no re-broadcast.
 */

export const MULTINODE_SCOPE = "multi-observer" as const;
export const MULTINODE_GUARANTEE =
  "multi-observer: each node's own view at its own observation point (its virtual DAA score is recorded with every answer); " +
  "agreement among nodes is not consensus validation, a majority of nodes does not decide what consensus accepted, and a difference a " +
  "node's lag can account for is reported as lag, not as agreement or disagreement; nothing was sent to any node";

/** A node of the set: a name for the reports, and a read-only client. */
export interface ReadNode {
  readonly label: string;
  readonly client: KaspaRpcClient;
}

export type NodeStanding = "usable" | "lagging" | "unsynced" | "wrong-network" | "unreachable" | "duplicate";

export interface NodeReading {
  readonly label: string;
  /** The client's endpoint, without credentials (absent when the client does not say). */
  readonly endpoint?: string | undefined;
  readonly standing: NodeStanding;
  readonly reasons: readonly string[];
  /** getServerInfo.networkId and getBlockDagInfo.network, as the node gave them. */
  readonly network?: { readonly server?: string | undefined; readonly dag?: string | undefined } | undefined;
  /** getInfo.p2pId: the node's own id (two endpoints answering with one id are one node). */
  readonly p2pId?: string | undefined;
  readonly serverVersion?: string | undefined;
  readonly isSynced?: boolean | undefined;
  readonly hasUtxoIndex?: boolean | undefined;
  readonly virtualDaaScore?: string | undefined;
  readonly sink?: string | undefined;
  readonly sinkBlueScore?: string | undefined;
  readonly pruningPointHash?: string | undefined;
  /** How far behind the most advanced node of the set it is, in DAA score (0 for that node). */
  readonly lagDaa?: string | undefined;
  readonly readAt: string;
}

export interface NodeSetReading {
  readonly scope: typeof MULTINODE_SCOPE;
  readonly guarantee: string;
  readonly expectedNetwork: string;
  readonly lagThresholdDaa: string;
  readonly nodes: readonly NodeReading[];
  /** The usable node with the highest virtual DAA score (the reference for lag). */
  readonly reference?: { readonly label: string; readonly virtualDaaScore: string } | undefined;
}

export interface MultinodeDisagreement {
  readonly code: "UTXO_ENTRY_CONFLICT" | "UTXO_PRESENCE_DISAGREES" | "TX_ACCEPTANCE_DIFFERS" | "TX_ACCEPTING_BLOCK_DIFFERS";
  readonly subject: string;
  readonly detail: string;
  readonly nodes: Readonly<Record<string, unknown>>;
}

export interface MultinodeLag {
  readonly subject: string;
  /** Why the nodes' lag can account for the difference (a hypothesis the DAA scores allow, not a proof). */
  readonly explanation: string;
  readonly nodes: Readonly<Record<string, unknown>>;
}

const DEFAULT_LAG_THRESHOLD_DAA = 100n;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const named = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s === "" || s === "undefined" || s.toLowerCase() === "unknown" ? undefined : s;
};
const big = (v: unknown): bigint | undefined => {
  try {
    return v === undefined || v === null ? undefined : BigInt(v as any);
  } catch {
    return undefined;
  }
};

async function dagOf(client: KaspaRpcClient): Promise<any> {
  const raw: any = await client.call<any>("getBlockDagInfo", {});
  return raw?.getBlockDagInfoResponse ?? raw;
}

/** One node's identity, read now (never throws: a node that cannot be read is `unreachable`). */
async function readNode(node: ReadNode, expected: string): Promise<Omit<NodeReading, "lagDaa">> {
  const endpointRaw = rpcEndpointOf(node.client);
  const endpoint = endpointRaw ? redactUrlCredentials(endpointRaw) : undefined;
  const readAt = new Date().toISOString();
  try {
    const server: any = await node.client.getServerInfo();
    const dag = await dagOf(node.client);
    let sinkBlueScore: string | undefined;
    try {
      const blue: any = typeof (node.client as any).getSinkBlueScore === "function" ? await node.client.getSinkBlueScore() : await node.client.call<any>("getSinkBlueScore", {});
      sinkBlueScore = big(blue?.blueScore ?? blue?.getSinkBlueScoreResponse?.blueScore ?? blue)?.toString();
    } catch {
      sinkBlueScore = undefined;
    }
    let p2pId: string | undefined;
    try {
      const info: any = await node.client.call<any>("getInfo", {});
      p2pId = named((info?.getInfoResponse ?? info)?.p2pId);
    } catch {
      p2pId = undefined;
    }
    const network = { server: named(server?.networkId), dag: named(dag?.network ?? dag?.networkName ?? dag?.networkId) };
    const daa = big(dag?.virtualDaaScore ?? server?.virtualDaaScore);
    const base = {
      label: node.label,
      ...(endpoint ? { endpoint } : {}),
      network,
      ...(p2pId ? { p2pId } : {}),
      ...(typeof server?.serverVersion === "string" ? { serverVersion: server.serverVersion } : {}),
      ...(typeof server?.isSynced === "boolean" ? { isSynced: server.isSynced } : {}),
      ...(typeof server?.hasUtxoIndex === "boolean" ? { hasUtxoIndex: server.hasUtxoIndex } : {}),
      ...(daa !== undefined ? { virtualDaaScore: daa.toString() } : {}),
      ...(typeof dag?.sink === "string" ? { sink: dag.sink } : {}),
      ...(sinkBlueScore !== undefined ? { sinkBlueScore } : {}),
      ...(typeof dag?.pruningPointHash === "string" ? { pruningPointHash: dag.pruningPointHash } : {}),
      readAt
    };
    // NODE-NETWORK-IDENTITY-1's rule, for reads: both answers name one network, and it is the expected one
    if (network.server === undefined || network.dag === undefined || canonicalNetworkId(network.server) !== canonicalNetworkId(network.dag)) {
      return { ...base, standing: "wrong-network", reasons: [`its answers do not name one network (getServerInfo: ${network.server ?? "none"}, getBlockDagInfo: ${network.dag ?? "none"})`] };
    }
    if (canonicalNetworkId(network.server) !== canonicalNetworkId(expected)) {
      return { ...base, standing: "wrong-network", reasons: [`it serves ${network.server}, not ${expected}`] };
    }
    if (daa === undefined) return { ...base, standing: "unreachable", reasons: ["it gave no virtual DAA score"] };
    if (server?.isSynced === false) return { ...base, standing: "unsynced", reasons: ["it says it is not synced"] };
    return { ...base, standing: "usable", reasons: [] };
  } catch (e) {
    return { label: node.label, ...(endpoint ? { endpoint } : {}), standing: "unreachable", reasons: [redactUrlCredentialsInText(messageOf(e))], readAt };
  }
}

/**
 * Every node's identity, read in parallel, and its lag behind the most advanced usable node (`lagging` beyond
 * `lagThresholdDaa`, default 100). `expectedNetwork` is required: answers of different networks are never compared.
 */
export async function readNodeSet(nodes: readonly ReadNode[], options: { expectedNetwork: string; lagThresholdDaa?: bigint }): Promise<NodeSetReading> {
  if (typeof options?.expectedNetwork !== "string" || options.expectedNetwork.trim() === "") {
    throw new HardkasError("MULTINODE_NETWORK_REQUIRED", "A node set is read for one network: say which (expectedNetwork). Nothing was read.");
  }
  const labels = nodes.map((n) => n.label);
  if (new Set(labels).size !== labels.length) throw new HardkasError("MULTINODE_LABELS_NOT_UNIQUE", `Each node needs its own label (${labels.join(", ")}). Nothing was read.`);
  const threshold = options.lagThresholdDaa ?? DEFAULT_LAG_THRESHOLD_DAA;
  const firstRead = await Promise.all(nodes.map((n) => readNode(n, options.expectedNetwork)));
  // one node behind two endpoints (another spelling, a proxy) is one node: compared with itself it would only agree
  const seen = new Map<string, string>();
  const read = firstRead.map((r) => {
    if (!r.p2pId) return r;
    const first = seen.get(r.p2pId);
    if (first === undefined) {
      seen.set(r.p2pId, r.label);
      return r;
    }
    return { ...r, standing: "duplicate" as const, reasons: [`the same node as ${first} (p2p id ${r.p2pId})`] };
  });
  // the reference is a usable node. If 3 or more usable nodes are present, find the peer cluster to resist rogue outlier DAAs
  const usable = read.filter((r) => r.standing === "usable");
  let peerTop: (typeof read)[number] | undefined;
  if (usable.length > 0) {
    const sorted = [...usable].sort((a, b) => (BigInt(a.virtualDaaScore!) < BigInt(b.virtualDaaScore!) ? -1 : 1));
    if (sorted.length >= 3) {
      const mid = Math.floor(sorted.length / 2);
      const medianDaa = BigInt(sorted[mid]!.virtualDaaScore!);
      const clusterTolerance = threshold * 50n > 5000n ? threshold * 50n : 5000n;
      const peerCluster = sorted.filter((r) => {
        const diff = BigInt(r.virtualDaaScore!) - medianDaa;
        const absDiff = diff < 0n ? -diff : diff;
        return absDiff <= clusterTolerance;
      });
      if (peerCluster.length >= 2) {
        peerTop = peerCluster[peerCluster.length - 1];
      } else {
        peerTop = sorted[sorted.length - 1];
      }
    } else {
      peerTop = sorted[sorted.length - 1];
    }
  }

  const outlierTolerance = threshold * 100n > 10000n ? threshold * 100n : 10000n;

  const readings: NodeReading[] = read.map((r) => {
    if (!peerTop || r.virtualDaaScore === undefined || (r.standing !== "usable" && r.standing !== "unsynced")) return r;
    const daa = BigInt(r.virtualDaaScore);
    const refDaa = BigInt(peerTop.virtualDaaScore!);
    const lag = refDaa - daa;

    // A node claiming a DAA score wildly ahead of the peer cluster is flagged as an outlier
    if (r.standing === "usable" && daa > refDaa && (daa - refDaa) > outlierTolerance) {
      const aheadBy = daa - refDaa;
      return {
        ...r,
        standing: "usable",
        reasons: [`virtual DAA score is an extreme outlier (+${aheadBy} DAA ahead of peer reference ${peerTop.label})`],
        lagDaa: "0"
      };
    }

    if (r.standing === "usable" && lag > threshold) {
      return { ...r, standing: "lagging" as const, reasons: [`${lag} DAA behind ${peerTop.label} (threshold ${threshold})`], lagDaa: lag.toString() };
    }
    return { ...r, lagDaa: (lag > 0n ? lag : 0n).toString() };
  });
  return {
    scope: MULTINODE_SCOPE,
    guarantee: MULTINODE_GUARANTEE,
    expectedNetwork: options.expectedNetwork,
    lagThresholdDaa: threshold.toString(),
    nodes: readings,
    ...(peerTop ? { reference: { label: peerTop.label, virtualDaaScore: peerTop.virtualDaaScore! } } : {})
  };
}

/** The nodes of a reading whose answers can be compared: the expected network, reachable (lagging and unsynced included, their lag known). */
function comparable(nodes: readonly ReadNode[], set: NodeSetReading): Array<{ node: ReadNode; reading: NodeReading }> {
  return nodes
    .map((node) => ({ node, reading: set.nodes.find((r) => r.label === node.label)! }))
    .filter((x) => x.reading && x.reading.standing !== "wrong-network" && x.reading.standing !== "unreachable" && x.reading.standing !== "duplicate");
}

function atLeastTwo(n: number, what: string, failures: Readonly<Record<string, string>> = {}): void {
  if (n < 2) {
    const why = Object.entries(failures).map(([label, error]) => `${label}: ${error}`);
    throw new HardkasError(
      "MULTINODE_INSUFFICIENT_NODES",
      `Comparing ${what} needs at least two nodes of the expected network that answer; ${n} did${why.length ? ` (${why.join("; ")})` : ""}. Nothing was compared.`,
      { metadata: { failures } }
    );
  }
}
const failuresOf = (answers: Record<string, any>) =>
  Object.fromEntries(Object.entries(answers).filter(([, a]) => typeof a?.error === "string").map(([label, a]) => [label, String(a.error)]));

type ListedUtxo = { address: string; amountSompi: string; scriptPublicKey: string; covenantId?: string; blockDaaScore?: string; isCoinbase?: boolean };

export interface UtxoComparison {
  readonly scope: typeof MULTINODE_SCOPE;
  readonly guarantee: string;
  readonly addresses: readonly string[];
  /** Per node: what it listed, between which DAA scores (its answer is a snapshot taken between them). */
  readonly nodes: Readonly<
    Record<string, { readonly listed: number; readonly totalSompi: string; readonly daaBefore: string; readonly daaAfter: string } | { readonly error: string }>
  >;
  /** Outpoints every comparable node listed with the same entry. */
  readonly agreed: readonly string[];
  readonly lag: readonly MultinodeLag[];
  readonly disagreements: readonly MultinodeDisagreement[];
}

/**
 * The UTXOs of `addresses` at each comparable node (one read each, between two DAA scores), compared outpoint by
 * outpoint: the same entry everywhere (agreed), a different entry for one outpoint (UTXO_ENTRY_CONFLICT: consensus has
 * one entry per outpoint, so some node is wrong), or an outpoint some nodes list and others do not — lag when the DAA
 * scores account for it (a node not yet at the output's block, or listing nodes all behind the ones that no longer list
 * it), UTXO_PRESENCE_DISAGREES otherwise. A node without a UTXO index, or failing, is reported and left out.
 */
export async function compareUtxosAcrossNodes(nodes: readonly ReadNode[], set: NodeSetReading, addresses: readonly string[]): Promise<UtxoComparison> {
  if (addresses.length === 0) throw new HardkasError("MULTINODE_ADDRESSES_REQUIRED", "Name at least one address to compare. Nothing was read.");
  const answers: Record<string, any> = {};
  const listings = new Map<string, { daaBefore: bigint; daaAfter: bigint; utxos: Map<string, ListedUtxo> }>();
  await Promise.all(
    comparable(nodes, set).map(async ({ node, reading }) => {
      if (reading.hasUtxoIndex === false) {
        answers[node.label] = { error: "the node has no UTXO index" };
        return;
      }
      try {
        const daaBefore = BigInt((await dagOf(node.client))?.virtualDaaScore);
        const raw: any = await node.client.getUtxosByAddresses([...addresses]);
        const after = await dagOf(node.client);
        const afterNetwork = named(after?.network ?? after?.networkName ?? after?.networkId);
        if (afterNetwork === undefined || canonicalNetworkId(afterNetwork) !== canonicalNetworkId(set.expectedNetwork)) {
          throw new Error(`it no longer says it serves ${set.expectedNetwork} (${afterNetwork ?? "none"})`);
        }
        const daaAfter = BigInt(after?.virtualDaaScore);
        const utxos = new Map<string, ListedUtxo>();
        for (const e of (raw?.entries ?? raw ?? []) as any[]) {
          const u = v1NodeUtxoOf(e);
          if (!u) continue;
          utxos.set(u.key, {
            address: String(e?.address ?? ""),
            amountSompi: u.utxo.amountSompi.toString(),
            scriptPublicKey: u.utxo.scriptPublicKey,
            ...(u.utxo.covenantId ? { covenantId: u.utxo.covenantId } : {}),
            ...(u.utxo.blockDaaScore !== undefined ? { blockDaaScore: u.utxo.blockDaaScore.toString() } : {}),
            ...(u.utxo.isCoinbase !== undefined ? { isCoinbase: u.utxo.isCoinbase } : {})
          });
        }
        listings.set(node.label, { daaBefore, daaAfter, utxos });
        answers[node.label] = {
          listed: utxos.size,
          totalSompi: [...utxos.values()].reduce((s, u) => s + BigInt(u.amountSompi), 0n).toString(),
          daaBefore: daaBefore.toString(),
          daaAfter: daaAfter.toString()
        };
      } catch (e) {
        answers[node.label] = { error: redactUrlCredentialsInText(messageOf(e)) };
      }
    })
  );
  atLeastTwo(listings.size, `UTXOs`, failuresOf(answers));
  const labels = [...listings.keys()].sort();
  const keys = [...new Set(labels.flatMap((l) => [...listings.get(l)!.utxos.keys()]))].sort();
  const agreed: string[] = [];
  const lag: MultinodeLag[] = [];
  const disagreements: MultinodeDisagreement[] = [];
  const same = (a: ListedUtxo, b: ListedUtxo) => a.amountSompi === b.amountSompi && a.scriptPublicKey === b.scriptPublicKey && (a.covenantId ?? "") === (b.covenantId ?? "");
  for (const key of keys) {
    const listing = labels.filter((l) => listings.get(l)!.utxos.has(key));
    const missing = labels.filter((l) => !listings.get(l)!.utxos.has(key));
    const first = listings.get(listing[0]!)!.utxos.get(key)!;
    const entries = Object.fromEntries(listing.map((l) => [l, listings.get(l)!.utxos.get(key)!]));
    if (listing.some((l) => !same(listings.get(l)!.utxos.get(key)!, first))) {
      disagreements.push({ code: "UTXO_ENTRY_CONFLICT", subject: key, detail: "the nodes list this outpoint with different entries (amount, script or covenant id)", nodes: entries });
      continue;
    }
    if (missing.length === 0) {
      agreed.push(key);
      continue;
    }
    const daa = (l: string) => listings.get(l)!;
    const created = big(first.blockDaaScore);
    const max = (xs: bigint[]) => xs.reduce((a, b) => (a > b ? a : b));
    const min = (xs: bigint[]) => xs.reduce((a, b) => (a < b ? a : b));
    // a new output some nodes have not reached yet, or a spent one only nodes behind still list
    const isLaggingNode = (label: string) => set.nodes.find((n) => n.label === label)?.standing === "lagging";
    const notReached = created !== undefined && missing.every((l) => daa(l).daaAfter < created);
    const spentFromLagging = listing.every(isLaggingNode) && missing.some((l) => !isLaggingNode(l) && daa(l).daaBefore > max(listing.map((x) => daa(x).daaAfter)));
    const nodesView = Object.fromEntries(labels.map((l) => [l, { lists: listing.includes(l), daaBefore: daa(l).daaBefore.toString(), daaAfter: daa(l).daaAfter.toString() }]));
    if (notReached) {
      lag.push({ subject: key, explanation: `created at DAA ${created}; the nodes that do not list it had not reached it (${missing.join(", ")})`, nodes: nodesView });
    } else if (spentFromLagging) {
      lag.push({ subject: key, explanation: `only nodes behind list it (${listing.join(", ")}); the nodes ahead may already have seen it spent (${missing.join(", ")})`, nodes: nodesView });
    } else {
      disagreements.push({ code: "UTXO_PRESENCE_DISAGREES", subject: key, detail: `listed by ${listing.join(", ")}, not by ${missing.join(", ")}, and their DAA scores do not account for it`, nodes: nodesView });
    }
  }
  return { scope: MULTINODE_SCOPE, guarantee: MULTINODE_GUARANTEE, addresses: [...addresses], nodes: answers, agreed, lag, disagreements };
}

export interface TxAcrossNodes {
  readonly scope: typeof MULTINODE_SCOPE;
  readonly guarantee: string;
  readonly txId: string;
  /** Per node: what its one look found, at which point; or why it could not look. */
  readonly nodes: Readonly<
    Record<string, { readonly finding: TxObservation["finding"]; readonly point: TxObservation["point"]; readonly observerId: string } | { readonly error: string }>
  >;
  readonly acceptedBy: readonly string[];
  readonly lag: readonly MultinodeLag[];
  readonly disagreements: readonly MultinodeDisagreement[];
  /** The sealed observations (one per node, each with its own observer id), for a caller that keeps evidence. */
  readonly observations: readonly TxObservation[];
}

const ACCEPTED = new Set(["chain_accepted", "finality_reached"]);

/**
 * One look per comparable node at `txId` (the SDK's observer: mempool, then the virtual chain from `since` — a chain
 * block every node should hold, e.g. the submission's submit point — else each node's pruning point), compared: nodes
 * whose chain accepted it, and which block; a node that has not, while its virtual DAA score is past the accepting
 * block's, disagrees (TX_ACCEPTANCE_DIFFERS); behind it, that is lag. Two accepting blocks are TX_ACCEPTING_BLOCK_DIFFERS
 * (their selected chains differ, e.g. during a reorg). Nothing is sent: a transaction a node does not hold is reported,
 * never handed to it.
 */
export async function observeTxAcrossNodes(nodes: readonly ReadNode[], set: NodeSetReading, txId: string, options: { since?: string; maxBatches?: number } = {}): Promise<TxAcrossNodes> {
  if (!/^[0-9a-f]{64}$/.test(txId)) throw new HardkasError("MULTINODE_TXID_INVALID", `'${String(txId).slice(0, 80)}' is not a 64-hex transaction id. Nothing was read.`);
  if (options.since !== undefined && !/^[0-9a-f]{64}$/.test(options.since)) {
    throw new HardkasError("MULTINODE_SINCE_INVALID", `since must be a 64-hex chain block hash. Nothing was read.`);
  }
  const results: Record<string, any> = {};
  const observations: TxObservation[] = [];
  await Promise.all(
    comparable(nodes, set).map(async ({ node }) => {
      const endpoint = rpcEndpointOf(node.client);
      const observerId = deriveObserverId({ kind: "rpc", target: set.expectedNetwork, ...(endpoint ? { locator: endpoint } : { locator: `node:${node.label}` }) });
      try {
        const look = await observeTxOnce(
          rpcObserverFor(node.client),
          {
            txId,
            observerId,
            ...(options.since ? { since: options.since, sinceExplicit: true } : {}),
            ...(options.maxBatches !== undefined ? { maxBatches: options.maxBatches } : {}),
            networkId: set.expectedNetwork as TxObservation["networkId"],
            mode: "rpc" as TxObservation["mode"],
            ...(endpoint ? { rpcUrl: redactUrlCredentials(endpoint) } : {})
          },
          systemRuntimeContext
        );
        observations.push(look);
        results[node.label] = { finding: look.finding, point: look.point, observerId };
      } catch (e) {
        results[node.label] = { error: redactUrlCredentialsInText(messageOf(e)) };
      }
    })
  );
  const looked = Object.keys(results).filter((l) => results[l].finding).sort();
  atLeastTwo(looked.length, `a transaction`, failuresOf(results));
  const acceptedBy = looked.filter((l) => ACCEPTED.has(results[l].finding.type));
  const lag: MultinodeLag[] = [];
  const disagreements: MultinodeDisagreement[] = [];
  const view = Object.fromEntries(looked.map((l) => [l, { finding: results[l].finding.type, ...(results[l].finding.acceptingBlockHash ? { acceptingBlockHash: results[l].finding.acceptingBlockHash } : {}), virtualDaaScore: results[l].point.virtualDaaScore }]));
  const blocks = [...new Set(acceptedBy.map((l) => String(results[l].finding.acceptingBlockHash)))];
  if (blocks.length > 1) {
    disagreements.push({ code: "TX_ACCEPTING_BLOCK_DIFFERS", subject: txId, detail: `the nodes name ${blocks.length} accepting blocks (${blocks.join(", ")}): their selected chains differ`, nodes: view });
  }
  if (acceptedBy.length > 0 && acceptedBy.length < looked.length) {
    // the accepting block's DAA score, where a node said it (chain_accepted carries it)
    const acceptingDaa = acceptedBy.map((l) => big(results[l].finding.acceptingDaaScore)).filter((d): d is bigint => d !== undefined);
    const lowest = acceptingDaa.length > 0 ? acceptingDaa.reduce((a, b) => (a < b ? a : b)) : undefined;
    const notAccepting = looked.filter((l) => !acceptedBy.includes(l));
    const threshold = BigInt(set.lagThresholdDaa ?? 100);
    const behind = (l: string) => lowest !== undefined && BigInt(results[l].point.virtualDaaScore) < lowest && (lowest - BigInt(results[l].point.virtualDaaScore)) <= threshold;
    const explained = notAccepting.filter(behind);
    const unexplained = notAccepting.filter((l) => !behind(l));
    if (explained.length > 0) lag.push({ subject: txId, explanation: `${explained.join(", ")} had not reached the accepting block's DAA score (${lowest})`, nodes: view });
    if (unexplained.length > 0) {
      disagreements.push({ code: "TX_ACCEPTANCE_DIFFERS", subject: txId, detail: `accepted by ${acceptedBy.join(", ")}; ${unexplained.join(", ")} did not accept it though not behind the accepting block`, nodes: view });
    }
  }
  return { scope: MULTINODE_SCOPE, guarantee: MULTINODE_GUARANTEE, txId, nodes: results, acceptedBy, lag, disagreements, observations };
}
