import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompiToKas, type NetworkId } from "@hardkas/core";
import { resolveRuntimeConfig, type KaspaRealNetwork } from "@hardkas/node-orchestrator";

export interface AccountsRealBalanceOptions {
  name: string;
  network?: "simnet" | "testnet-10" | "mainnet";
  url?: string;
  workspaceRoot?: string;
}

export async function runAccountsRealBalance(
  options: AccountsRealBalanceOptions
): Promise<{
  balanceSompi: bigint;
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
  const balance = await client.getBalanceByAddress(account.address);
  await client.close();

  const formatted = `${account.name} balance: ${formatSompiToKas(balance.balanceSompi)} (${account.address})`;

  return {
    balanceSompi: balance.balanceSompi,
    formatted
  };
}
