import { HardkasError } from "@hardkas/core";

export function assertPublicNetworkAllowed(
  networkId: string | undefined,
  policy: { allowPublic?: boolean }
): void {
  const isPublicAllowed = policy.allowPublic === true;
  
  if (!networkId) return; // If no network is specified, we can't block it based on networkId.

  const safeNetworks = ["simnet", "simulated", "local-docker-simnet", "local", "devnet"];
  
  // If it's a known safe local network, it's allowed.
  if (safeNetworks.includes(networkId.toLowerCase())) {
    return;
  }

  // If it's explicitly mainnet, testnet, or we don't know it, we treat it as public/external.
  // We must block it unless allowPublic is true.
  if (!isPublicAllowed) {
    throw new HardkasError(
      "PUBLIC_NETWORK_BLOCKED",
      `The network '${networkId}' is treated as a public or external network and is blocked by default. ` +
      `You must explicitly set 'allowPublic: true' in your policy or network configuration to use it.`
    );
  }
}
