import { JsonWrpcKaspaClient, KaspaRpcUtxo } from "@hardkas/kaspa-rpc";
import { formatSompiToKas, nodeRpcUrl } from "@hardkas/core";

export interface RpcUtxosOptions {
  address: string;
  /** Node wRPC endpoint; defaults to the canonical localnet. */
  url?: string | undefined;
}

export async function runRpcUtxos(options: RpcUtxosOptions): Promise<{
  url: string;
  address: string;
  utxos: KaspaRpcUtxo[];
  totalSompi: bigint;
  formatted: string;
}> {
  const url = options.url || nodeRpcUrl();
  const client = new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 10000 });
  try {
    const utxos = await client.getUtxosByAddress(options.address);
    const totalSompi = utxos.reduce((acc, u) => acc + u.amountSompi, 0n);

    const lines = [
      `Kaspa UTXOs for ${options.address}`,
      "",
      `Found: ${utxos.length} UTXO(s)`
    ];

    if (utxos.length > 0) {
      lines.push("");
      lines.push("ID                                      | Amount (KAS) | DAA Score");
      lines.push("-".repeat(75));

      utxos.forEach((u) => {
        const id = `${u.outpoint.transactionId}:${u.outpoint.index}`.padEnd(40);
        const amount = formatSompiToKas(u.amountSompi).padStart(12);
        const score = (u.blockDaaScore?.toString() || "unknown").padStart(10);
        lines.push(`${id} | ${amount} | ${score}`);
      });

      lines.push("-".repeat(75));
      lines.push(`Total balance: ${formatSompiToKas(totalSompi)} KAS`);
    }

    return { url, address: options.address, utxos, totalSompi, formatted: lines.join("\n") };
  } finally {
    await client.close();
  }
}
