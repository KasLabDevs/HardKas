import type { KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { finalityDepthFor, HardkasError } from "@hardkas/core";
import {
  createTxObservationArtifact,
  evidenceDigest,
  RPC_OBSERVER_DESCRIPTION,
  type TxObservation,
  type TxObservationFinding,
  type TxObservationPoint
} from "@hardkas/artifacts";
import type { RuntimeContext } from "@hardkas/core";

// Wave 2(a) · Q4 / IC-2′.3 — the RPC observer. It asks the configured node what it
// currently sees about a txId and seals ONE `hardkas.txObservation.v1` per look.
// It never decides a state: `deriveTxStatus` does, over the persisted observations.

/** The five reads an observation needs, so tests can script a node without a socket. */
export interface TxObserverRpc {
  getBlockDagInfo(): Promise<{ networkId: string; virtualDaaScore: bigint; sink: string; pruningPointHash?: string; serverVersion?: string }>;
  getSinkBlueScore(): Promise<bigint>;
  /** `null` when the node answers "not found"; transport errors propagate. */
  getMempoolEntry(txId: string): Promise<{ isOrphan: boolean; feeSompi?: string } | null>;
  getVirtualChainFromBlock(startHash: string): Promise<{
    removedChainBlockHashes: string[];
    addedChainBlockHashes: string[];
    acceptedTransactionIds: Array<{ acceptingBlockHash: string; acceptedTransactionIds: string[] }>;
  }>;
  getBlockHeader(hash: string): Promise<{ blueScore: bigint; daaScore: bigint } | null>;
}

export interface TxObserverRpcRecorder {
  rpc: TxObserverRpc;
  /** Raw responses, in call order, digested into the observation's `evidence`. */
  evidence: TxObservation["evidence"];
}

const isNotFound = (e: unknown): boolean => {
  const msg = String((e as any)?.message ?? e).toLowerCase();
  const code = String((e as any)?.code ?? "").toUpperCase();
  return code.includes("NOT_FOUND") || msg.includes("not found") || msg.includes("no_data") || msg.includes("entry not found");
};

/**
 * MCP-7G-FIX: rusty-kaspa (2.1.0 `rpc/service`, getVirtualChainFromBlock) zips the added chain blocks with their
 * acceptance data in order and truncates `added` to it, so an answer with accepted ids carries exactly one entry per
 * added block, naming that block, in the same order. An answer that does not is rejected whole: it establishes no
 * acceptance, no removal and no cursor progress, and the look seals nothing (the next one re-reads from the last
 * verified cursor).
 */
function assertCoherentChainAnswer(chain: Awaited<ReturnType<TxObserverRpc["getVirtualChainFromBlock"]>>, startHash: string): void {
  const added = chain?.addedChainBlockHashes;
  const accepted = chain?.acceptedTransactionIds;
  let reason: string | undefined;
  if (!Array.isArray(added) || !Array.isArray(accepted) || !Array.isArray(chain?.removedChainBlockHashes)) {
    reason = "its chain block lists are missing";
  } else if (accepted.length !== added.length) {
    reason = `${added.length} added chain blocks but acceptance data for ${accepted.length}`;
  } else {
    const i = accepted.findIndex((a, j) => a?.acceptingBlockHash !== added[j] || !Array.isArray(a?.acceptedTransactionIds));
    if (i >= 0) reason = `acceptance entry ${i} names ${String(accepted[i]?.acceptingBlockHash)}, not the added chain block ${added[i]}`;
  }
  if (reason) {
    throw new HardkasError(
      "OBSERVE_CHAIN_ANSWER_INCOHERENT",
      `The node's virtual-chain answer from ${startHash} is not coherent (${reason}). It was rejected whole: nothing was recorded and the cursor did not move; observe again.`
    );
  }
}

/** Adapts a `KaspaRpcClient` to the observer reads and records raw responses as evidence. */
export function rpcObserverFor(client: KaspaRpcClient): TxObserverRpcRecorder {
  const evidence: TxObservation["evidence"] = [];
  const record = <T>(method: string, params: unknown, response: T): T => {
    evidence.push({ method, params, responseDigest: evidenceDigest(response) });
    return response;
  };
  const rpc: TxObserverRpc = {
    async getBlockDagInfo() {
      const raw: any = record("getBlockDagInfo", {}, await client.call<any>("getBlockDagInfo", {}));
      const info: any = raw?.getBlockDagInfoResponse ?? raw;
      let serverVersion: string | undefined;
      try {
        const server: any = record("getServerInfo", {}, await client.getServerInfo());
        serverVersion = typeof server?.serverVersion === "string" ? server.serverVersion : undefined;
      } catch {
        serverVersion = undefined;
      }
      return {
        networkId: String(info?.networkName ?? info?.network ?? info?.networkId ?? "unknown"),
        virtualDaaScore: BigInt(info?.virtualDaaScore ?? 0),
        sink: String(info?.sink ?? info?.sinkHash ?? ""),
        ...(typeof info?.pruningPointHash === "string" ? { pruningPointHash: info.pruningPointHash } : {}),
        ...(serverVersion ? { serverVersion } : {})
      };
    },
    async getSinkBlueScore() {
      const raw: any = record("getSinkBlueScore", {}, await client.getSinkBlueScore());
      return BigInt(raw?.blueScore ?? raw?.getSinkBlueScoreResponse?.blueScore ?? raw);
    },
    async getMempoolEntry(txId) {
      const params = { transactionId: txId, includeOrphanPool: true, filterTransactionPool: false };
      try {
        const raw: any = record("getMempoolEntry", params, await client.call<any>("getMempoolEntry", params));
        const entry: any = raw?.mempoolEntry ?? raw?.entry ?? raw;
        if (!entry) return null;
        return {
          isOrphan: entry.isOrphan === true,
          ...(entry.fee !== undefined ? { feeSompi: String(entry.fee) } : {})
        };
      } catch (e) {
        if (isNotFound(e)) {
          record("getMempoolEntry", params, { error: "TransactionNotFound" });
          return null;
        }
        throw e;
      }
    },
    async getVirtualChainFromBlock(startHash) {
      const params = { startHash, includeAcceptedTransactionIds: true };
      const raw: any = record("getVirtualChainFromBlock", params, await client.call<any>("getVirtualChainFromBlock", params));
      const r: any = raw?.getVirtualChainFromBlockResponse ?? raw;
      const acceptedRaw: any[] = Array.isArray(r?.acceptedTransactionIds)
        ? r.acceptedTransactionIds
        : Array.isArray(r?.chainBlockAcceptedTransactions)
          ? r.chainBlockAcceptedTransactions.map((c: any) => ({
              acceptingBlockHash: c?.chainBlockHeader?.hash ?? c?.blockHash ?? c?.acceptingBlockHash ?? "",
              acceptedTransactionIds: (c?.acceptedTransactions ?? []).map((t: any) => t?.transactionId ?? t?.verboseData?.transactionId ?? t?.id ?? t)
            }))
          : [];
      return {
        removedChainBlockHashes: r?.removedChainBlockHashes ?? [],
        addedChainBlockHashes: r?.addedChainBlockHashes ?? r?.addedChainBlocks ?? [],
        acceptedTransactionIds: acceptedRaw.map((a: any) => ({
          acceptingBlockHash: String(a?.acceptingBlockHash ?? ""),
          acceptedTransactionIds: Array.isArray(a?.acceptedTransactionIds) ? a.acceptedTransactionIds.map(String) : []
        }))
      };
    },
    async getBlockHeader(hash) {
      const params = { hash, includeTransactions: false };
      try {
        const raw: any = record("getBlock", params, await client.call<any>("getBlock", params));
        const header: any = raw?.block?.header ?? raw?.getBlockResponse?.block?.header ?? raw?.header;
        if (!header) return null;
        return { blueScore: BigInt(header.blueScore ?? 0), daaScore: BigInt(header.daaScore ?? 0) };
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    }
  };
  return { rpc, evidence };
}

export interface ObserveTxOptions {
  txId: string;
  /** Opaque, stable identity of THIS observer instance (`obs_<64hex>`): histories are derived per observer. */
  observerId: string;
  /** The 64-hex artifactId of the submission this observation is about, when known. */
  submissionArtifactId?: string;
  /** Chain block hash to scan the virtual chain from (the observer's cursor). */
  since?: string;
  /**
   * TN10-CONFIRMATION-FIX-1: `since` was given by the caller (not derived from earlier evidence). When the node cannot
   * serve the virtual chain from it, the look throws `OBSERVE_SINCE_UNAVAILABLE` and seals nothing: an unknown or
   * pruned cursor says nothing about the transaction, so it is never recorded as a `pruned_unobservable` finding.
   */
  sinceExplicit?: boolean;
  /** Block hash previously observed as accepting, to detect its removal from the chain. */
  previousAcceptingBlockHash?: string;
  /** Upper bound on `getVirtualChainFromBlock` batches per observation (each ≈ mergeset limit × 10 chain blocks). */
  maxBatches?: number;
  networkId: TxObservation["networkId"];
  mode: TxObservation["mode"];
  execution?: TxObservation["execution"];
  rpcUrl?: string;
  workflowId?: string;
  assumptionLevel?: string;
}

/**
 * ONE look at the node, sealed as ONE observation. Order of evidence: point
 * (DAG info + sink blue score) → mempool → virtual chain from `since` → accepting
 * block header → finality rule. Nothing here interprets; the finding is what was seen.
 */
export async function observeTxOnce(
  recorder: TxObserverRpcRecorder,
  options: ObserveTxOptions,
  ctx: RuntimeContext
): Promise<TxObservation> {
  const { rpc } = recorder;
  const dag = await rpc.getBlockDagInfo();
  const sinkBlueScore = await rpc.getSinkBlueScore();
  const point: TxObservationPoint = {
    virtualDaaScore: dag.virtualDaaScore.toString(),
    sinkHash: dag.sink,
    sinkBlueScore: sinkBlueScore.toString(),
    ...(dag.pruningPointHash ? { pruningPointHash: dag.pruningPointHash } : {})
  };
  const finalityDepth = finalityDepthFor(options.networkId);
  const observer: TxObservation["observer"] = {
    observerId: options.observerId,
    kind: "rpc",
    networkId: options.networkId,
    ...(dag.serverVersion ? { serverVersion: dag.serverVersion } : {}),
    capabilities: { reorgAware: true },
    description: RPC_OBSERVER_DESCRIPTION
  };
  const seal = (finding: TxObservationFinding) =>
    createTxObservationArtifact(
      {
        networkId: options.networkId,
        mode: options.mode,
        ...(options.execution ? { execution: options.execution } : {}),
        subject: { txId: options.txId, ...(options.submissionArtifactId ? { submissionArtifactId: options.submissionArtifactId } : {}) },
        observer,
        point,
        finding,
        evidence: [...recorder.evidence],
        ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
        ...(options.workflowId ? { workflowId: options.workflowId } : {}),
        ...(options.assumptionLevel ? { assumptionLevel: options.assumptionLevel } : {})
      },
      ctx
    );

  const acceptedBy = async (acceptingBlockHash: string): Promise<TxObservationFinding> => {
    const header = await rpc.getBlockHeader(acceptingBlockHash);
    if (!header) {
      return { type: "pruned_unobservable", reason: `accepting block ${acceptingBlockHash} is not served by the observer` };
    }
    const confirmationsBlue = sinkBlueScore - header.blueScore;
    const confirmationsDaa = dag.virtualDaaScore - header.daaScore;
    if (finalityDepth !== undefined && confirmationsBlue >= BigInt(finalityDepth)) {
      return {
        type: "finality_reached",
        acceptingBlockHash,
        acceptingBlueScore: header.blueScore.toString(),
        confirmationsBlue: confirmationsBlue.toString(),
        finalityDepth: String(finalityDepth)
      };
    }
    return {
      type: "chain_accepted",
      acceptingBlockHash,
      acceptingBlueScore: header.blueScore.toString(),
      acceptingDaaScore: header.daaScore.toString(),
      confirmationsBlue: (confirmationsBlue < 0n ? 0n : confirmationsBlue).toString(),
      confirmationsDaa: (confirmationsDaa < 0n ? 0n : confirmationsDaa).toString()
    };
  };

  const maxBatches = options.maxBatches ?? 20;

  // 1. A block previously observed as accepting: is it still on the selected chain?
  //    If so, its depth is re-measured from the current sink. If the node reports it
  //    removed, the same answer lists the chain blocks that replaced it: when one of
  //    them (or one in the answers that continue it, within the batch bound) accepts
  //    the transaction, the acceptance moved to that block and the finding says so;
  //    only when none does is the removal the finding. If the node cannot answer the
  //    first question, fall through; an incoherent answer ends the look with nothing sealed.
  if (options.previousAcceptingBlockHash) {
    const prev = options.previousAcceptingBlockHash;
    let fromPrevious: Awaited<ReturnType<TxObserverRpc["getVirtualChainFromBlock"]>> | undefined;
    try {
      fromPrevious = await rpc.getVirtualChainFromBlock(prev);
    } catch {
      fromPrevious = undefined;
    }
    if (fromPrevious) {
      assertCoherentChainAnswer(fromPrevious, prev);
      if (fromPrevious.removedChainBlockHashes.includes(prev)) {
        let chain = fromPrevious;
        let cursor = prev;
        for (let batch = 1; ; batch++) {
          const hit = chain.acceptedTransactionIds.find((a) => a.acceptedTransactionIds.includes(options.txId));
          if (hit) {
            const finding = await acceptedBy(hit.acceptingBlockHash);
            return seal(finding.type === "chain_accepted" ? { ...finding, removedAcceptingBlockHash: prev } : finding);
          }
          const last = chain.addedChainBlockHashes[chain.addedChainBlockHashes.length - 1];
          if (!last || last === cursor || batch >= maxBatches) break;
          cursor = last;
          chain = await rpc.getVirtualChainFromBlock(cursor);
          assertCoherentChainAnswer(chain, cursor);
        }
        return seal({ type: "chain_removed", acceptingBlockHash: prev });
      }
      return seal(await acceptedBy(prev));
    }
  }

  // 2. Mempool (local, transient). MEMPOOL-CHAIN-PRECEDENCE-FIX-1: recorded, but it never ends the look by itself —
  //    a node can keep an entry its own virtual chain already accepted (rusty-kaspa #1146), so the chain is read too.
  const mempool = await rpc.getMempoolEntry(options.txId);

  // 3. Virtual chain from the cursor, in bounded batches. An acceptance found here, in the node's current view, is the
  //    finding even when the mempool still lists the transaction.
  const start = options.since ?? dag.pruningPointHash;
  let scanned = 0;
  let cursor = start;
  let answered = 0;
  let complete = false;
  if (start) {
    for (let batch = 0; batch < maxBatches; batch++) {
      let chain;
      try {
        chain = await rpc.getVirtualChainFromBlock(cursor!);
      } catch (e) {
        const message = String((e as any)?.message ?? e);
        // kaspad 2.1.0 answers an unknown/pruned start with "cannot find header …", "some data is missing …" or
        // "… does not have source on its chain"
        if (options.sinceExplicit && batch === 0 && (isNotFound(e) || /prun|not in selected|unknown block|not found|cannot find|data is missing|source on its chain/i.test(message))) {
          throw new HardkasError(
            "OBSERVE_SINCE_UNAVAILABLE",
            `The node cannot serve the virtual chain from ${cursor} (unknown or pruned): ${message}. Nothing was recorded; ` +
              `give a chain block the node still holds that precedes the transaction's acceptance.`
          );
        }
        if (isNotFound(e) || /prun|not in selected|unknown block|not found/i.test(message)) {
          // With a mempool entry the look still says what it saw; its window ends at the last block actually read.
          if (mempool) break;
          return seal({ type: "pruned_unobservable", reason: `the observer cannot serve the virtual chain from ${cursor}: ${String((e as any)?.message ?? e)}` });
        }
        throw e;
      }
      assertCoherentChainAnswer(chain, cursor!);
      answered++;
      scanned += chain.addedChainBlockHashes.length;
      const hit = chain.acceptedTransactionIds.find((a) => a.acceptedTransactionIds.includes(options.txId));
      if (hit) return seal(await acceptedBy(hit.acceptingBlockHash));
      const last = chain.addedChainBlockHashes[chain.addedChainBlockHashes.length - 1];
      if (!last || last === cursor) {
        complete = true;
        break;
      }
      cursor = last;
    }
  }

  if (mempool) {
    return seal({
      type: "mempool_entry",
      isOrphan: mempool.isOrphan,
      ...(mempool.feeSompi ? { feeSompi: mempool.feeSompi } : {}),
      // The chain window this look actually read (only when the node answered at least once): `scannedTo` is the last
      // chain block read, a safe next cursor; `scanComplete` is false when the scan stopped at the batch bound or the
      // node stopped answering before its selected-chain tip.
      ...(start && answered > 0 ? { scannedFrom: start, scannedTo: cursor!, scannedChainBlocks: scanned, scanComplete: complete } : {})
    });
  }

  return seal({
    type: "not_found",
    ...(start ? { scannedFrom: start } : {}),
    ...(cursor && cursor !== start ? { scannedTo: cursor } : {}),
    scannedChainBlocks: scanned
  });
}
