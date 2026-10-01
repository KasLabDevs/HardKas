import { JsonWrpcKaspaClient, BlockDagInfo } from "@hardkas/kaspa-rpc";
import { nodeRpcUrl } from "@hardkas/core";

export interface RpcDagOptions {
  /** Node wRPC endpoint; defaults to the canonical localnet. */
  url?: string | undefined;
}

export async function runRpcDag(options: RpcDagOptions = {}): Promise<{
  url: string;
  dag: BlockDagInfo;
  formatted: string;
}> {
  const url = options.url || nodeRpcUrl();
  const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 10000 });
  try {
    const dag = await client.getBlockDagInfo();
    const tips = dag.tipHashes ?? [];

    const lines = [
      "Kaspa DAG info",
      "",
      `Network:        ${dag.networkId}`,
      `Virtual DAA:    ${dag.virtualDaaScore?.toString() || "unknown"}`,
      `Sink:           ${dag.sink || "unknown"}`,
      `Tips:           ${tips.length}`
    ];

    if (tips.length > 0) {
      lines.push("");
      lines.push("Tips:");
      tips.slice(0, 5).forEach((hash) => lines.push(`  - ${hash}`));
      if (tips.length > 5) {
        lines.push(`  ... and ${tips.length - 5} more`);
      }
    }

    return { url, dag, formatted: lines.join("\n") };
  } finally {
    await client.close();
  }
}
