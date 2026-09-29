import { JsonWrpcKaspaClient, ServerInfo } from "@hardkas/kaspa-rpc";
import { nodeRpcUrl } from "@hardkas/core";

export interface RpcInfoOptions {
  /** Node wRPC endpoint; defaults to the canonical localnet. */
  url?: string | undefined;
}

export interface RpcInfoResult {
  url: string;
  info?: ServerInfo;
  error?: string;
  formatted: string;
}

export async function runRpcInfo(options: RpcInfoOptions = {}): Promise<RpcInfoResult> {
  const url = options.url || nodeRpcUrl();
  const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 10000 });
  try {
    const info = await client.getServerInfo();
    const yesNo = (v: boolean | undefined) => (v === undefined ? "unknown" : v ? "yes" : "no");
    const lines = [
      "Kaspa RPC info",
      "",
      `URL:          ${url}`,
      `Network:      ${info.networkId}`,
      `Version:      ${info.serverVersion || "unknown"}`,
      `Synced:       ${yesNo(info.isSynced)}`,
      `UTXO index:   ${yesNo(info.hasUtxoIndex)}`,
      `Virtual DAA:  ${info.virtualDaaScore?.toString() ?? "unknown"}`
    ];
    return { url, info, formatted: lines.join("\n") };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    const lines = ["Kaspa RPC info", "", `URL:      ${url}`, `Status:   unreachable`, `Error:    ${error}`];
    return { url, error, formatted: lines.join("\n") };
  } finally {
    await client.close();
  }
}
