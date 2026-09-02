import { resolveHardkasAccount } from "@hardkas/accounts";
import { Hardkas } from "@hardkas/sdk";
import { UI } from "../ui.js";
import { TxPlanArtifact, SignedTxArtifact } from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";

export interface TxSignRunnerInput {
  planArtifact: TxPlanArtifact;
  accountName?: string;
  config: HardkasConfig;
  allowMainnetSigning?: boolean;
  append?: boolean;
  threshold?: number;
  requiredSigners?: string[];
  workspaceRoot?: string;
  targetName?: string;
  signer?: any;
}

/**
 * Reusable logic for transaction signing.
 */
export async function runTxSign(input: TxSignRunnerInput): Promise<SignedTxArtifact> {
  const {
    planArtifact,
    accountName,
    config,
    allowMainnetSigning,
    append,
    threshold,
    requiredSigners,
    workspaceRoot,
    targetName,
    signer
  } = input;

  const targetAccountName =
    accountName ||
    planArtifact.from?.accountName ||
    planArtifact.from?.input ||
    planArtifact.from?.address;

  const { resolveArtifactTarget, resolveLegacyArtifactTarget } = await import("@hardkas/config");
  const { assertAccountCompatible, resolveHardkasAccount } = await import("@hardkas/accounts");
  const { LegacyArtifactRequiresExplicitResolutionError } = await import("@hardkas/core");

  let executionTarget: any;
  try {
    const { target: artifactTarget } = resolveArtifactTarget({ artifact: planArtifact as any });
    executionTarget = artifactTarget;
  } catch (e: any) {
    if (e.name === "LegacyArtifactRequiresExplicitResolutionError") {
      console.warn("⚠️ [Legacy] Artifact lacks execution identity. Inferring target from configuration.");
      const { target: legacyTarget } = resolveLegacyArtifactTarget({ artifact: planArtifact as any, config });
      executionTarget = legacyTarget;
    } else {
      throw e;
    }
  }

  if (targetName) {
    const { resolveNewIntentTarget } = await import("@hardkas/config");
    let explicitTarget: import("@hardkas/core").HardkasExecutionTarget | undefined = undefined;
    if (config.execution && "targets" in config.execution) {
      explicitTarget = (config.execution.targets as any)[targetName];
    }
    if (!explicitTarget) {
      throw new Error(`Execution target '${targetName}' not found in hardkas.config.ts`);
    }

    if (
      executionTarget.domain !== explicitTarget.domain ||
      executionTarget.mode !== explicitTarget.mode ||
      executionTarget.network !== explicitTarget.network
    ) {
      throw new Error(`Execution target mismatch. Plan requires ${executionTarget.mode} on ${executionTarget.network}, but --target specified ${explicitTarget.mode} on ${explicitTarget.network}.`);
    }
    executionTarget = explicitTarget;
  }

  const resolvedConfig: any = workspaceRoot ? { ...config, cwd: workspaceRoot } : { ...config };

  // Inject execution context into config so resolveHardkasAccount can yield the appropriate account kind
  if (executionTarget) {
    resolvedConfig.execution = executionTarget;
  }

  const account = resolveHardkasAccount({ nameOrAddress: targetAccountName, config: resolvedConfig });
  assertAccountCompatible(account, executionTarget);

  const artifactNetwork = planArtifact.networkId;
  const accountAddressNetwork = getNetworkFromAddress(account.address || "");

  if (artifactNetwork === "mainnet") {
    UI.warning("CRITICAL: You are signing a transaction for MAINNET.");
    UI.info("HardKAS is developer infrastructure, not production custody software.");
    UI.info("Do not use high-value mainnet keys in this environment.");

    if (!allowMainnetSigning) {
      throw new Error(
        "Mainnet signing is blocked. Use --allow-mainnet-signing if you understand the risks."
      );
    }
  }

  // Check for network mismatch
  if (artifactNetwork !== accountAddressNetwork && accountAddressNetwork !== "unknown") {
    if (artifactNetwork === "mainnet" || accountAddressNetwork === "mainnet") {
      throw new Error(
        `Network mismatch: Plan is for '${artifactNetwork}' but account is for '${accountAddressNetwork}'. Refusing to sign.`
      );
    }
  }

  // Open the SDK to perform transaction signing & event emission & SQLite indexing
  const sdk = await Hardkas.open({ cwd: workspaceRoot || process.cwd(), signer });

  const signedArtifact = await sdk.tx.sign(planArtifact as any, accountName, {
    ...(append !== undefined ? { append } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    ...(requiredSigners !== undefined ? { requiredSigners } : {})
  });

  return signedArtifact;
}

export function getNetworkFromAddress(address: string): string {
  if (address.startsWith("kaspa:sim_") || address.startsWith("kaspasim:"))
    return "simnet";
  if (address.startsWith("kaspa:")) return "mainnet";
  if (address.startsWith("kaspatest:")) return "testnet-10";
  return "unknown";
}
