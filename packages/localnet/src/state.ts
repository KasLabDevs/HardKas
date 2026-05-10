import { SOMPI_PER_KAS, NetworkId, ExecutionMode } from "@hardkas/core";
import { HardkasArtifactBase, Snapshot, HARDKAS_VERSION, ARTIFACT_SCHEMAS } from "@hardkas/artifacts";
import { createDeterministicAccounts } from "./accounts";
import type { LocalnetState } from "./types";

export interface CreateInitialStateOptions {
  accounts?: number | undefined;
  initialBalanceSompi?: bigint | undefined;
}

export function createInitialLocalnetState(
  options: CreateInitialStateOptions = {}
): LocalnetState {
  const accountCount = options.accounts ?? 5;
  const initialBalanceSompi = options.initialBalanceSompi ?? 1000n * SOMPI_PER_KAS;

  const accounts = createDeterministicAccounts({
    count: accountCount,
    initialBalanceSompi
  });

  return {
    schema: ARTIFACT_SCHEMAS.LOCALNET_STATE,
    hardkasVersion: HARDKAS_VERSION,
    version: "1.0.0-alpha",
    createdAt: new Date().toISOString(),
    mode: "simulated" as ExecutionMode,
    networkId: "simnet" as NetworkId,
    daaScore: "0",
    accounts: accounts.map(a => ({
      name: a.name,
      address: a.address
    })),
    utxos: accounts.map(a => ({
      id: `genesis:${a.name}:0`,
      address: a.address,
      amountSompi: a.balanceSompi.toString(),
      spent: false,
      createdAtDaaScore: "0"
    })),
    snapshots: []
  };
}

export function resolveAccountAddressFromState(
  state: LocalnetState,
  nameOrAddress: string
): string {
  // If it looks like a kaspa address, return it
  if (nameOrAddress.startsWith("kaspa:")) {
    return nameOrAddress;
  }

  // Search in accounts
  const account = state.accounts.find(a => a.name === nameOrAddress);
  if (account) {
    return account.address;
  }

  return nameOrAddress;
}
