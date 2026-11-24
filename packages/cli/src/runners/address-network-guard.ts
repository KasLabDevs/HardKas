import { addressPrefixMatchesNetwork, addressPrefixNetworkHint, assertMainnetConnectionsDisabled } from "@hardkas/core";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

/**
 * AUDIT 2026-11-21 · M4 · an address read is judged on the address BEFORE any connection: with a network, the address's
 * prefix must be that network's; without one, an address of the mainnet type is refused (mainnet is not reachable). The
 * prefix is only a hint (every testnet shares `kaspatest:`), so the node's own identity check still follows.
 */
export function assertAddressReadable(address: string, network: string | undefined, command: string): void {
  const a = address.trim();
  if (network === undefined) {
    assertMainnetConnectionsDisabled([addressPrefixNetworkHint(a)], command);
    return;
  }
  if (!addressPrefixMatchesNetwork(a, network)) {
    throw new HardkasCliError(
      "ADDRESS_NETWORK_MISMATCH",
      `${command}: '${a.slice(0, 120)}' is not an address of ${network} (its prefix names ${addressPrefixNetworkHint(a) ?? "no Kaspa network"}). Nothing was contacted.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
}
