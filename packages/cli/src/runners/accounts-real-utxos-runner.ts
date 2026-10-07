import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompiToKas, type NetworkId } from "@hardkas/core";
import { resolveRuntimeConfig, type KaspaRealNetwork } from "@hardkas/node-orchestrator";

export interface AccountsRealUtxosOptions {
  name: string;
  network?: "simnet" | "testnet-10" | "mainnet";
  url?: string;
  workspaceRoot?: string;
}

export async function runAccountsRealUtxos(options: AccountsRealUtxosOptions): Promise<{
  formatted: string;
}> {
  const cwd = options.workspaceRoot || process.cwd();
  const store = await loadRealAccountStore({ cwd });
  const account = store ? getRealDevAccount(store, options.name) : null;

  if (!account) {
    throw new Error(`Account '${options.name}' not found in real store.`);
  }

  let rpcUrl = options.url;
  if (!rpcUrl) {
    rpcUrl = resolveRuntimeConfig({
      network: (options.network ?? "simnet") as KaspaRealNetwork
    }).rpcUrl;
  }

  const client = new JsonWrpcKaspaClient({ rpcUrl });
  let utxos;
  try {
    utxos = await client.getUtxosByAddress(account.address);
  } finally {
    // RESOURCE-LIFECYCLE-1 (RL-I3): released when the read fails too.
    await client.close();
  }

  const lines = [
    `UTXOs for ${account.name} (${account.address})`,
    `Network: ${options.network || "simnet"}`,
    `RPC:     ${rpcUrl}`,
    ""
  ];

  if (utxos.length === 0) {
    lines.push("No UTXOs found.");
  } else {
    utxos.forEach((u) => {
      lines.push(`${u.outpoint.transactionId}:${u.outpoint.index}`);
      lines.push(`  Amount: ${formatSompiToKas(u.amountSompi)}`);
      lines.push("");
    });
  }

  return { formatted: lines.join("\n") };
}
