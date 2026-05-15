import { 
  resolveHardkasAccount, 
  signTxPlanArtifact 
} from "@hardkas/accounts";
import { UI } from "../ui.js";
import { 
  TxPlanArtifact, 
  SignedTxArtifact 
} from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";

export interface TxSignRunnerInput {
  planArtifact: TxPlanArtifact;
  accountName?: string;
  config: HardkasConfig;
  allowMainnetSigning?: boolean;
}

/**
 * Reusable logic for transaction signing.
 */
export async function runTxSign(input: TxSignRunnerInput): Promise<SignedTxArtifact> {
  const { planArtifact, accountName, config, allowMainnetSigning } = input;
  
  const targetAccountName = accountName || planArtifact.from.accountName || planArtifact.from.input || planArtifact.from.address;
  const account = resolveHardkasAccount({ nameOrAddress: targetAccountName, config });

  // Robust Network Guard
  // Resolution order: artifact network > CLI --network (if we had it) > active profile > address prefix fallback.
  const artifactNetwork = planArtifact.networkId;
  const accountAddressNetwork = getNetworkFromAddress(account.address || "");
  const activeProfileNetwork = config.defaultNetwork;

  if (artifactNetwork === "mainnet") {
    UI.warning("CRITICAL: You are signing a transaction for MAINNET.");
    UI.info("HardKAS is developer infrastructure, not production custody software.");
    UI.info("Do not use high-value mainnet keys in this environment.");

    if (!allowMainnetSigning) {
      throw new Error("Mainnet signing is blocked. Use --allow-mainnet-signing if you understand the risks.");
    }
  }

  // Check for network mismatch
  if (artifactNetwork !== accountAddressNetwork && accountAddressNetwork !== "unknown") {
    // If artifact is mainnet but account is testnet/simnet, fail.
    // If artifact is testnet but account is mainnet, fail (safety).
    if (artifactNetwork === "mainnet" || accountAddressNetwork === "mainnet") {
      throw new Error(`Network mismatch: Plan is for '${artifactNetwork}' but account is for '${accountAddressNetwork}'. Refusing to sign.`);
    }
  }

  const signedArtifact = await signTxPlanArtifact({
    planArtifact,
    account,
    config,
    allowMainnet: allowMainnetSigning ?? false
  });

  return signedArtifact;
}

function getNetworkFromAddress(address: string): string {
  if (address.startsWith("kaspa:")) return "mainnet";
  if (address.startsWith("kaspatest:")) return "testnet-10";
  if (address.startsWith("kaspasim:")) return "simnet";
  return "unknown";
}
