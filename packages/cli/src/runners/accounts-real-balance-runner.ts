import { 
  loadRealAccountStore, 
  getRealDevAccount 
} from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompi } from "@hardkas/core";
import { resolveRuntimeConfig } from "@hardkas/node-orchestrator";

export interface AccountsRealBalanceOptions {
  name: string;
  network?: "simnet" | "testnet-10" | "mainnet";
  url?: string;
}

export async function runAccountsRealBalance(options: AccountsRealBalanceOptions): Promise<{
  balanceSompi: bigint;
  formatted: string;
}> {
  const store = await loadRealAccountStore();
  const account = store ? getRealDevAccount(store, options.name) : null;
  
  if (!account) {
    throw new Error(`Account '${options.name}' not found in real store.`);
  }

  let rpcUrl = options.url;
  if (!rpcUrl) {
    rpcUrl = resolveRuntimeConfig({ network: options.network as any || "simnet" }).rpcUrl;
  }

  const client = new JsonWrpcKaspaClient({ rpcUrl });
  const balance = await client.getBalanceByAddress(account.address);
  await client.close();

  const formatted = `${account.name} balance: ${formatSompi(balance.balanceSompi)} (${account.address})`;

  return {
    balanceSompi: balance.balanceSompi,
    formatted
  };
}
