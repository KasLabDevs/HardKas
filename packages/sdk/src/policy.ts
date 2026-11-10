import { HardkasError, isMainnetNetworkId } from "@hardkas/core";

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
    // RC1 (oracle O2): for mainnet the allowPublic advice does not apply (mainnet stays refused with it), so it is not given
    throw new HardkasError(
      "PUBLIC_NETWORK_BLOCKED",
      isMainnetNetworkId(networkId)
        ? `The network '${networkId}' is mainnet, which is NO-GO in this release: allowPublic does not enable it. Use simnet, devnet or a testnet.`
        : `The network '${networkId}' is treated as a public or external network and is blocked by default. ` +
            `You must explicitly set 'allowPublic: true' in your policy or network configuration to use it.`
    );
  }
}
