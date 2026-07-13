import type { LocalnetState, LocalnetUtxo } from "./types";
import { resolveAccountAddressFromState } from "./state";

/**
 * Resolve a query address to the canonical localnet address for UTXO matching.
 * Handles the dual-address system:
 * - `kaspa:sim_<name>` (localnet state format)
 * - `kaspasim:<bech32>` (from @hardkas/accounts deterministic key derivation)
 * - `kaspatest:<bech32>` (testnet addresses)
 *
 * When a `kaspasim:` bech32 address or `kaspatest:` address is queried and no
 * UTXOs match directly, we fall through to `resolveAccountAddressFromState`.
 */
function resolveMatchAddress(state: LocalnetState, address: string): string {
  // First try: exact match (handles kaspa:sim_* and any address stored directly)
  const directMatch = state.utxos.some((u) => u.address === address && !u.spent);
  if (directMatch) return address;

  // Second try: resolve through account name lookup
  const resolved = resolveAccountAddressFromState(state, address);
  if (resolved !== address) return resolved;

  // No resolution found, return as-is (will produce empty results)
  return address;
}

export function getAddressBalanceSompi(state: LocalnetState, address: string): bigint {
  const matchAddress = resolveMatchAddress(state, address);
  return state.utxos
    .filter((u) => u.address === matchAddress && !u.spent)
    .reduce((sum, u) => sum + BigInt(u.amountSompi), 0n);
}

export function getAccountBalanceSompi(
  state: LocalnetState,
  nameOrAddress: string
): bigint {
  const address = resolveAccountAddressFromState(state, nameOrAddress);
  return getAddressBalanceSompi(state, address);
}

export function getSpendableUtxos(state: LocalnetState, address: string): LocalnetUtxo[] {
  const matchAddress = resolveMatchAddress(state, address);
  return state.utxos.filter((u) => u.address === matchAddress && !u.spent);
}

