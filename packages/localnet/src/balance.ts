import type { LocalnetState, LocalnetUtxo } from "./types";
import { resolveAccountAddressFromState } from "./state";

export function getAddressBalanceSompi(
  state: LocalnetState,
  address: string
): bigint {
  return state.utxos
    .filter(u => u.address === address && !u.spent)
    .reduce((sum, u) => sum + BigInt(u.amountSompi), 0n);
}

export function getAccountBalanceSompi(
  state: LocalnetState,
  nameOrAddress: string
): bigint {
  const address = resolveAccountAddressFromState(state, nameOrAddress);
  return getAddressBalanceSompi(state, address);
}

export function getSpendableUtxos(
  state: LocalnetState,
  address: string
): LocalnetUtxo[] {
  return state.utxos.filter(u => u.address === address && !u.spent);
}
