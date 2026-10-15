import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompiToKas, type NetworkId } from "@hardkas/core";
import { loadHardkasConfig, resolveNodeEndpoint } from "@hardkas/config";

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

  // TESTNET-PORT-COLLISION-1: the shared endpoint authority (given, declared, a local network's default, or
  // NETWORK_ENDPOINT_REQUIRED before any connection); NODE-NETWORK-IDENTITY-1: the node must say it serves that network
  const network = options.network ?? "simnet";
  const { config } = await loadHardkasConfig({ cwd });
  const rpcUrl = resolveNodeEndpoint({ config, networkId: network, explicitUrl: options.url }).url;

  const client = new JsonWrpcKaspaClient({ rpcUrl, expectedNetworkId: network });
  let balance;
  try {
    balance = await client.getBalanceByAddress(account.address);
  } finally {
    // RESOURCE-LIFECYCLE-1 (RL-I3): released when the read fails too.
    await client.close();
  }

  const formatted = `${account.name} balance: ${formatSompiToKas(balance.balanceSompi)} (${account.address})`;

  return {
    balanceSompi: balance.balanceSompi,
    formatted
  };
}
