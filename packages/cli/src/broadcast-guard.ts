import { assertMainnetTransactionsDisabled, isMainnetNetworkId } from "@hardkas/core";

/**
 * Security guard for network broadcasting.
 * Blocks mainnet (SDK-MAINNET-BROADCAST-GUARD-1: the product policy shared with the SDK, typed
 * MAINNET_BROADCAST_DISABLED) and prevents network mismatches.
 */
export function assertBroadcastNetworkAllowed(input: {
  artifactNetworkId: string;
  selectedNetwork: string;
}): void {
  // Mainnet block: the artifact's network and the selected one, whichever names mainnet
  assertMainnetTransactionsDisabled("broadcast", [input.artifactNetworkId, input.selectedNetwork], "tx send");

  // Network mismatch check
  if (!isSameNetwork(input.artifactNetworkId, input.selectedNetwork)) {
    throw new Error(
      `Network mismatch: signed artifact targets '${input.artifactNetworkId}' ` +
        `but CLI selected '${input.selectedNetwork}'.`
    );
  }
}

function isSameNetwork(n1: string, n2: string): boolean {
  // Simple exact match or mainnet-like equivalence
  if (n1 === n2) return true;
  if (isMainnetNetworkId(n1) && isMainnetNetworkId(n2)) return true;

  // Potential future mapping could go here
  return false;
}
