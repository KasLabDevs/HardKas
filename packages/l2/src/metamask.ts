import type { L2NetworkProfile } from "./profiles.js";

export interface MetaMaskChainParams {
  chainId: string; // hex string
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[] | undefined;
}

/**
 * Generates the standard wallet_addEthereumChain payload for MetaMask.
 */
export function generateAddEthereumChainPayload(profile: L2NetworkProfile): MetaMaskChainParams {
  if (!profile.chainId) {
    throw new Error(`Profile "${profile.name}" is missing chainId`);
  }
  if (!profile.rpcUrl) {
    throw new Error(`Profile "${profile.name}" is missing rpcUrl`);
  }

  return {
    chainId: `0x${profile.chainId.toString(16)}`,
    chainName: profile.displayName || profile.name,
    nativeCurrency: {
      name: profile.gasToken || "iKAS",
      symbol: profile.gasToken || "iKAS",
      decimals: profile.nativeTokenDecimals || 18,
    },
    rpcUrls: [profile.rpcUrl],
    blockExplorerUrls: profile.explorerUrl ? [profile.explorerUrl] : undefined,
  };
}

/**
 * Generates a JavaScript snippet for browser consoles to add the network to MetaMask.
 */
export function generateMetaMaskSnippet(profile: L2NetworkProfile): string {
  const payload = generateAddEthereumChainPayload(profile);
  
  return `await window.ethereum.request({
  method: "wallet_addEthereumChain",
  params: [
    ${JSON.stringify(payload, null, 4).replace(/\n/g, "\n    ")}
  ]
});`;
}
