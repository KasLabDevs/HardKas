import { resolveHardkasAccount } from "@hardkas/accounts";
import { Hardkas } from "@hardkas/sdk";
import { UI } from "../ui.js";
import { TxPlanArtifact, SignedTxArtifact } from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";
import { assertMainnetTransactionsDisabled } from "@hardkas/core";

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
  /** Where an encrypted account's keystore password comes from (never from argv). */
  passwordEnv?: string;
  passwordStdin?: boolean;
  /** Machine-readable output: never prompts. */
  json?: boolean;
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
    // WORKSPACE-AUTHORITY-2: the named target is looked up by the shared resolver (typed EXECUTION_TARGET_NOT_FOUND)
    const { resolveWorkspaceExecution } = await import("@hardkas/config");
    const explicitTarget = resolveWorkspaceExecution({ config, target: targetName }).execution;

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

  const account = resolveHardkasAccount({ nameOrAddress: targetAccountName, config: resolvedConfig, executionTarget });
  assertAccountCompatible(account, executionTarget);

  const artifactNetwork = planArtifact.networkId;
  const accountAddressNetwork = getNetworkFromAddress(account.address || "");

  // SDK-MAINNET-BROADCAST-GUARD-1: mainnet signing is refused (MAINNET_SIGNING_DISABLED, the product policy shared
  // with the SDK) whatever --allow-mainnet-signing says: the flag stays refused in this release.
  // (the account/artifact network mismatch below keeps its own refusal; the SDK checks the instance's network too)
  void allowMainnetSigning;
  assertMainnetTransactionsDisabled("sign", [artifactNetwork], "tx sign");

  // Check for network mismatch
  if (artifactNetwork !== accountAddressNetwork && accountAddressNetwork !== "unknown") {
    if (artifactNetwork === "mainnet" || accountAddressNetwork === "mainnet") {
      throw new Error(
        `Network mismatch: Plan is for '${artifactNetwork}' but account is for '${accountAddressNetwork}'. Refusing to sign.`
      );
    }
  }

  // An encrypted real account opens only with its owner's password, read before anything is
  // signed or written: from the named variable, from stdin, or prompted on a terminal. It stays in
  // memory for this call. Development accounts (`.hardkas/dev-accounts/`) need none.
  let keystorePassword: string | undefined;
  const acc: any = account;
  if (!signer && acc.kind === "kaspa" && acc.keystorePath && acc.keystoreKind !== "dev-account" && !acc.privateKey && !acc.privateKeyEnv) {
    const { acquirePassword } = await import("./secrets.js");
    keystorePassword = await acquirePassword({
      env: input.passwordEnv,
      stdin: input.passwordStdin,
      interactive: !input.json,
      message: `Enter the keystore password of account '${acc.name}':`
    });
  }

  // Open the SDK to perform transaction signing & event emission & SQLite indexing
  const sdk = await Hardkas.open({ cwd: workspaceRoot || process.cwd(), signer });

  try {
    const signedArtifact = await sdk.tx.sign(planArtifact as any, accountName, {
      ...(append !== undefined ? { append } : {}),
      ...(threshold !== undefined ? { threshold } : {}),
      ...(requiredSigners !== undefined ? { requiredSigners } : {}),
      ...(keystorePassword !== undefined ? { keystorePassword } : {})
    });

    return signedArtifact;
  } finally {
    // RESOURCE-LIFECYCLE-1 (RL-I1/RL-I3): the SDK opened above is released here; the signer handed to it is not its own.
    await sdk.close();
  }
}

export function getNetworkFromAddress(address: string): string {
  if (address.startsWith("kaspa:sim_") || address.startsWith("kaspasim:"))
    return "simnet";
  if (address.startsWith("kaspa:")) return "mainnet";
  if (address.startsWith("kaspatest:")) return "testnet-10";
  return "unknown";
}
