import { KaspaJsonRpcClient, ServerInfo } from "@hardkas/kaspa-rpc";

export interface RpcInfoOptions {
  url?: string;
}

export async function runRpcInfo(options: RpcInfoOptions = {}): Promise<{
  info: ServerInfo;
  url: string;
  formatted: string;
}> {
  const client = new KaspaJsonRpcClient({ url: options.url || "http://127.0.0.1:18210" });
  const info = await client.getServerInfo();
  
  const url = options.url || "http://127.0.0.1:18210";
  
  const lines = [
    "Kaspa RPC info",
    "",
    `URL:      ${url}`,
    `Network:  ${info.networkId}`,
    `Synced:   ${info.isSynced ? "yes" : "no"}`,
    `Version:  ${info.serverVersion || "unknown"}`
  ];

  return {
    info,
    url,
    formatted: lines.join("\n")
  };
}
