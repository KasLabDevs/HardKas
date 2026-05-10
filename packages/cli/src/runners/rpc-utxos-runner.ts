import { KaspaJsonRpcClient, KaspaRpcUtxo } from "@hardkas/kaspa-rpc";
import { formatSompi } from "@hardkas/core";

export interface RpcUtxosOptions {
  address: string;
  url?: string;
}

export async function runRpcUtxos(options: RpcUtxosOptions): Promise<{
  utxos: KaspaRpcUtxo[];
  formatted: string;
}> {
  const client = new KaspaJsonRpcClient({ url: options.url || "http://127.0.0.1:18210" });
  const utxos = await client.getUtxosByAddress(options.address);
  
  const lines = [
    `Kaspa UTXOs for ${options.address}`,
    "",
    `Found: ${utxos.length} UTXO(s)`
  ];

  if (utxos.length > 0) {
    lines.push("");
    lines.push("ID                                      | Amount       | DAA Score");
    lines.push("-".repeat(75));
    
    utxos.forEach(u => {
      const id = `${u.outpoint.transactionId}:${u.outpoint.index}`.padEnd(40);
      const amount = formatSompi(u.amountSompi).padStart(12);
      const score = (u.blockDaaScore?.toString() || "unknown").padStart(10);
      lines.push(`${id} | ${amount} | ${score}`);
    });
    
    const total = utxos.reduce((acc, u) => acc + u.amountSompi, 0n);
    lines.push("-".repeat(75));
    lines.push(`Total balance: ${formatSompi(total)}`);
  }

  return {
    utxos,
    formatted: lines.join("\n")
  };
}
