import { loadHardkasConfig } from "@hardkas/config";
import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompi, type NetworkId } from "@hardkas/core";
import { resolveRuntimeConfig } from "@hardkas/node-orchestrator";

export interface AccountBalanceResult {
  name: string;
  address: string;
  balanceSompi: bigint;
  utxoCount: number;
  network: string;
}

export interface AccountsBalanceOptions {
  identifier: string; // name or address
  network?: string;
  url?: string;
  local?: boolean;
}

export async function runAccountsBalance(
  options: AccountsBalanceOptions
): Promise<AccountBalanceResult> {
  // 1. Resolve Address
  let address = options.identifier;
  let name = "Unknown";

  // Try to find in project config
  const loadedConfig = await loadHardkasConfig({});
  const projectAccount = loadedConfig.config.accounts?.[options.identifier];

  if (projectAccount) {
    address = projectAccount.address ?? "";
    name = options.identifier;
  } else {
    // Try to find in real store
    const store = await loadRealAccountStore();
    const realAccount = store ? getRealDevAccount(store, options.identifier) : null;
    if (realAccount) {
      address = realAccount.address ?? "";
      name = realAccount.name;
    }
  }

  // 2. Setup RPC Client or Local Backend
  const network = options.network ?? loadedConfig.config.defaultNetwork ?? "simnet";
  const isSimulated = options.local || network === "simulated" || network === "simnet";

  if (isSimulated) {
    const { loadOrCreateLocalnetState, getSpendableUtxos } =
      await import("@hardkas/localnet");
    const localState = await loadOrCreateLocalnetState({ cwd: process.cwd() });
    const utxos = getSpendableUtxos(localState, address);
    const balanceSompi = utxos.reduce((acc, u) => acc + BigInt(u.amountSompi), 0n);

    return {
      name,
      address,
      balanceSompi,
      utxoCount: utxos.length,
      network: "simulated"
    };
  } else {
    let rpcUrl = options.url;
    if (!rpcUrl) {
      rpcUrl = resolveRuntimeConfig({
        network: network as "mainnet" | "testnet-10" | "simnet"
      }).rpcUrl;
    }

    const client = new JsonWrpcKaspaClient({ rpcUrl });

    try {
      const balance = await client.getBalanceByAddress(address);
      const utxos = await client.getUtxosByAddress(address);

      return {
        name,
        address,
        balanceSompi: balance.balanceSompi,
        utxoCount: utxos.length,
        network
      };
    } finally {
      await client.close();
    }
  }
}
