import { KaspaJsonRpcClient, ServerInfo } from "@hardkas/kaspa-rpc";

export interface RpcInfoOptions {
  url?: string;
}

export async function runRpcInfo(options: RpcInfoOptions = {}): Promise<{
  info?: ServerInfo;
  url: string;
  formatted: string;
}> {
  const url = options.url || "http://127.0.0.1:18210";
  const protocol = url.startsWith("ws") ? "WebSocket" : "JSON-RPC";

  try {
    const client = new KaspaJsonRpcClient({ url });
    const info = await client.getServerInfo();

    const lines = [
      "Kaspa RPC info",
      "",
      `URL:      ${url}`,
      `Protocol: ${protocol}`,
      `Network:  ${info.networkId}`,
      `Synced:   ${info.isSynced ? "yes" : "no"}`,
      `Version:  ${info.serverVersion || "unknown"}`
    ];

    return {
      info,
      url,
      formatted: lines.join("\n")
    };
  } catch (e: unknown) {
    const lines = [
      "Kaspa RPC info",
      "",
      `URL:      ${url}`,
      `Protocol: ${protocol}`,
      `Status:   unreachable`,
      `Error:    ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`
    ];
    return {
      url,
      formatted: lines.join("\n")
    };
  }
}
