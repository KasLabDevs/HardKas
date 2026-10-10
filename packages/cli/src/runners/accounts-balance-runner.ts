import { loadHardkasConfig } from "@hardkas/config";
import { loadRealAccountStore, getRealDevAccount } from "@hardkas/accounts";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { formatSompiToKas, type NetworkId } from "@hardkas/core";
import { resolveRuntimeConfig } from "@hardkas/node-orchestrator";
import { invocationWorkspaceRoot, requireExistingWorkspace } from "../workspace-root.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

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
  provider?: string;
  url?: string;
  local?: boolean;
}

export async function runAccountsBalance(
  options: AccountsBalanceOptions
): Promise<AccountBalanceResult> {
  // 1. Resolve Address
  let address = options.identifier;
  let name = "Unknown";

  // Try to find in project config · WORKSPACE-AUTHORITY-1 (WA-I0): the invocation's one workspace
  const workspaceRoot = invocationWorkspaceRoot();
  const loadedConfig = await loadHardkasConfig({ workspaceRoot });
  const projectAccount = loadedConfig.config.accounts?.[options.identifier];

  if (projectAccount) {
    address = projectAccount.address ?? "";
    name = options.identifier;
  } else {
    // Try to find in the same workspace's real account store (read only; absent → null)
    const store = await loadRealAccountStore({ cwd: workspaceRoot });
    const realAccount = store ? getRealDevAccount(store, options.identifier) : null;
    if (realAccount) {
      address = realAccount.address ?? "";
      name = realAccount.name;
    }
  }

  // 2. Setup RPC Client or Local Backend
  // #3 (accounts balance network): without --network the workspace's own default target decides
  // (its `execution` contract, else its legacy `defaultNetwork`), never a hardcoded simnet.
  const { resolveProvider, resolveNewIntentTarget } = await import("@hardkas/config");
  let configuredNetwork = "simulated";
  try {
    configuredNetwork = resolveNewIntentTarget({ config: loadedConfig.config }).network;
  } catch {
    // no target declared anywhere: the simulator, as everywhere else in HardKAS
  }
  const balanceNetwork = options.network ?? configuredNetwork;
  const declaredRpcUrl = (loadedConfig.config.networks as Record<string, { rpcUrl?: unknown }> | undefined)?.[balanceNetwork]?.rpcUrl;
  const provider = resolveProvider({
    network: balanceNetwork,
    provider: options.provider,
    url: options.url,
    // WORKSPACE-AUTHORITY-2 (closeout): the endpoint the network declares, the same the SDK uses
    networkRpcUrl: typeof declaredRpcUrl === "string" ? declaredRpcUrl : undefined
  });

  const network = provider.network;
  const isSimulated = options.local || provider.mode === "simulator";

  if (isSimulated) {
    // WORKSPACE-AUTHORITY-1: the simulator state of the invocation's one workspace (WA-I0), from any of its directories,
    // read without ever creating it (WA-I3): a balance is never computed from a state made up for the occasion.
    const { loadLocalnetState, getDefaultLocalnetStatePath, getSpendableUtxos, resolveMatchAddress } =
      await import("@hardkas/localnet");
    const workspace = requireExistingWorkspace("accounts balance");
    const statePath = getDefaultLocalnetStatePath(workspace.root);
    const localState = await loadLocalnetState(statePath);
    if (!localState) {
      throw new HardkasCliError(
        "SIMULATOR_STATE_NOT_FOUND",
        `There is no simulator state in ${workspace.root} (${statePath} does not exist); 'accounts balance' reads it and creates none. 'hardkas init' or the first simulated transaction creates it.`,
        { exitCode: HardkasExitCode.RUNTIME_FAILURE }
      );
    }
    const utxos = getSpendableUtxos(localState, address);
    const balanceSompi = utxos.reduce((acc, u) => acc + BigInt(u.amountSompi), 0n);
    // Demo-ready · E26: report the identity the query used — the simulator state's account and
    // the address its UTXOs are read from — not the raw input ("Account: Unknown / Address: alice").
    const queried = resolveMatchAddress(localState, address);
    const stateAccount = localState.accounts?.find((a) => a.address === queried);

    return {
      name: stateAccount?.name ?? name,
      address: queried,
      balanceSompi,
      utxoCount: utxos.length,
      network: "simulated"
    };
  } else {
    let rpcUrl = provider.endpoint;
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
