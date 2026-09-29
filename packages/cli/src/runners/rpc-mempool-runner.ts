import { JsonWrpcKaspaClient, RpcNotFoundError } from "@hardkas/kaspa-rpc";
import { nodeRpcUrl } from "@hardkas/core";

export interface RpcMempoolOptions {
  /** A transaction to look up; without it, the node's whole mempool is summarised. */
  txId?: string | undefined;
  /** Node wRPC endpoint; defaults to the canonical localnet. */
  url?: string | undefined;
}

export interface RpcMempoolTx {
  txId: string;
  feeSompi: string;
  isOrphan: boolean;
}

const LISTED = 20;

function mempoolTx(entry: any, txId?: string): RpcMempoolTx {
  return {
    txId: String(txId ?? entry?.transaction?.verboseData?.transactionId ?? entry?.transactionId ?? "unknown"),
    feeSompi: String(entry?.fee ?? "unknown"),
    isOrphan: entry?.isOrphan === true
  };
}

export async function runRpcMempool(options: RpcMempoolOptions = {}): Promise<{
  url: string;
  txId?: string | undefined;
  /** For a lookup: the entry, or null when the node does not hold the transaction. */
  entry?: RpcMempoolTx | null;
  /** Without a txId: every entry the node holds, orphans included. */
  entries?: RpcMempoolTx[];
  formatted: string;
}> {
  const url = options.url || nodeRpcUrl();
  const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 10000 });
  try {
    if (options.txId) {
      let raw: any = null;
      try {
        raw = await client.call("getMempoolEntry", {
          transactionId: options.txId,
          includeOrphanPool: true,
          filterTransactionPool: false
        });
      } catch (e) {
        if (!(e instanceof RpcNotFoundError)) throw e;
      }
      const found = raw?.mempoolEntry ?? raw?.entry;
      const entry = found ? mempoolTx(found, options.txId) : null;
      const lines = [`Kaspa mempool status for ${options.txId}`, ""];
      if (entry) {
        lines.push(`Status:   in the mempool${entry.isOrphan ? " (orphan)" : ""}`);
        lines.push(`Fee:      ${entry.feeSompi} sompi`);
      } else {
        lines.push(`Status:   not in the mempool`);
        lines.push(`Note:     the node may have accepted it already, rejected it, or never seen it.`);
      }
      return { url, txId: options.txId, entry, formatted: lines.join("\n") };
    }

    const raw: any = await client.getMempoolEntries({ includeOrphanPool: true, filterTransactionPool: false });
    const entries = (Array.isArray(raw?.mempoolEntries) ? raw.mempoolEntries : []).map((e: any) => mempoolTx(e));
    const lines = ["Kaspa mempool", "", `URL:      ${url}`, `Entries:  ${entries.length}`];
    if (entries.length > 0) {
      lines.push("");
      for (const e of entries.slice(0, LISTED)) {
        lines.push(`  ${e.txId}  fee ${e.feeSompi} sompi${e.isOrphan ? "  (orphan)" : ""}`);
      }
      if (entries.length > LISTED) lines.push(`  ... and ${entries.length - LISTED} more`);
    }
    return { url, entries, formatted: lines.join("\n") };
  } finally {
    await client.close();
  }
}
