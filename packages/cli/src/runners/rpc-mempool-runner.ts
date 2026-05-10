import { KaspaJsonRpcClient, MempoolEntry } from "@hardkas/kaspa-rpc";

export interface RpcMempoolOptions {
  txId: string;
  url?: string;
}

export async function runRpcMempool(options: RpcMempoolOptions): Promise<{
  entry: MempoolEntry | null;
  formatted: string;
}> {
  const client = new KaspaJsonRpcClient({ url: options.url || "http://127.0.0.1:18210" });
  const entry = await client.getMempoolEntry(options.txId);
  
  const lines = [
    `Kaspa Mempool status for ${options.txId}`,
    ""
  ];

  if (entry) {
    lines.push(`Status:   Found in mempool`);
    if (entry.acceptedAt) {
      lines.push(`Time:     ${entry.acceptedAt}`);
    }
  } else {
    lines.push(`Status:   Not found in mempool`);
    lines.push(`Note:     The transaction might be already confirmed or was never seen.`);
  }

  return {
    entry,
    formatted: lines.join("\n")
  };
}
