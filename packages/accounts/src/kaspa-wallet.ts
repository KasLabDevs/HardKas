import { GeneratedKaspaDevAccount } from "./real-keygen.js";
import { KaspaSdkKeyGenerator } from "./kaspa-sdk-keygen.js";

export interface CreateKaspaWalletOptions {
  networkId?: "simnet" | "testnet-10" | "mainnet";
}

/**
 * Generates a new Kaspa L1 developer wallet.
 * Strictly separate from EVM/L2 identities.
 */
export async function createLocalKaspaWallet(options?: CreateKaspaWalletOptions): Promise<GeneratedKaspaDevAccount> {
  const keygen = new KaspaSdkKeyGenerator({
    networkId: options?.networkId || "simnet"
  });
  
  return await keygen.generateAccount();
}
