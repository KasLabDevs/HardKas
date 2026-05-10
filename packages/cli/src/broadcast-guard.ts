/**
 * Security guard for network broadcasting.
 * Blocks mainnet by default and prevents network mismatches.
 */
export function assertBroadcastNetworkAllowed(input: {
  artifactNetworkId: string;
  selectedNetwork: string;
}): void {
  const isMainnetArtifact = isMainnetLike(input.artifactNetworkId);
  const isMainnetSelected = isMainnetLike(input.selectedNetwork);

  // Mainnet block
  if (isMainnetArtifact || isMainnetSelected) {
    throw new Error(
      "Mainnet broadcast is disabled in HardKAS v0.2-alpha.\n\n" +
      "Reason:\n" +
      "  Production transaction submission is intentionally unavailable in this development release.\n\n" +
      "Use:\n" +
      "  simnet or testnet for real transaction testing."
    );
  }

  // Network mismatch check
  if (!isSameNetwork(input.artifactNetworkId, input.selectedNetwork)) {
    throw new Error(
      `Network mismatch: signed artifact targets '${input.artifactNetworkId}' ` +
      `but CLI selected '${input.selectedNetwork}'.`
    );
  }
}

function isMainnetLike(network: string): boolean {
  const n = network.toLowerCase();
  return n === "mainnet" || n === "kaspa" || n === "kaspa-mainnet";
}

function isSameNetwork(n1: string, n2: string): boolean {
  // Simple exact match or mainnet-like equivalence
  if (n1 === n2) return true;
  if (isMainnetLike(n1) && isMainnetLike(n2)) return true;
  
  // Potential future mapping could go here
  return false;
}
