import { HardkasAccount } from "./types.js";

export interface EvmExportResult {
  address: `0x${string}`;
  privateKey?: `0x${string}`;
  isSecret: boolean;
  networkId: string;
}

/**
 * Validates and prepares an account for EVM export.
 * 
 * SECURITY CONSTRAINT: 
 * - Only explicit EVM/L2 accounts are exported.
 * - No derivation from Kaspa L1 keys in this PR.
 * - Fails on mainnet/testnet.
 */
export async function prepareEvmAccountExport(
  account: HardkasAccount,
  networkId: string,
  options: { includeSecret?: boolean } = {}
): Promise<EvmExportResult> {
  // 1. Hard failure on mainnet/public testnet
  if (networkId === "mainnet" || networkId.startsWith("testnet")) {
    throw new Error(`EVM account export is NOT allowed on network "${networkId}" for security reasons.`);
  }

  // 2. Only allow simnet/localnet
  if (networkId !== "simnet" && networkId !== "localnet") {
    throw new Error(`EVM account export is only supported on local development networks (simnet, localnet).`);
  }

  // 3. Only allow explicit EVM/L2 accounts
  if (account.kind !== "evm-private-key") {
    throw new Error(`Account "${account.name}" is not an EVM/L2 account (kind: ${account.kind}). Only explicit EVM accounts can be exported.`);
  }

  // 4. Validate address format (should be 0x-prefixed)
  if (!account.address || !account.address.startsWith("0x")) {
    throw new Error(`Account "${account.name}" does not have a valid EVM address.`);
  }

  const result: EvmExportResult = {
    address: account.address as `0x${string}`,
    isSecret: false,
    networkId
  };

  // 5. Handle private key if requested
  if (options.includeSecret) {
    let privateKey: string | undefined;

    if (account.kind === "evm-private-key") {
      if (account.privateKeyEnv) {
        privateKey = process.env[account.privateKeyEnv];
        if (!privateKey) {
          throw new Error(`Private key environment variable "${account.privateKeyEnv}" is not set.`);
        }
      } else {
        // In the future, this would fetch from the encrypted keystore.
        // For now, if it's not in an env var, we might not have it unless it's a raw account in config.
        // We check if the account object has a privateKey (legacy/config path)
        privateKey = (account as any).privateKey;
      }
    }

    if (privateKey) {
      // Ensure 0x prefix
      result.privateKey = privateKey.startsWith("0x") ? (privateKey as `0x${string}`) : `0x${privateKey}` as `0x${string}`;
      result.isSecret = true;
    } else {
      throw new Error(`Private key for account "${account.name}" could not be retrieved.`);
    }
  }

  return result;
}
