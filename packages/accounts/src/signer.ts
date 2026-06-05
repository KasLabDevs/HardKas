import {
  TxPlan,
  SignedTx,
  TxPlanArtifact,
  SignedTxArtifact,
  createSimulatedSignedTxArtifact,
  calculateContentHash,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  createLineageTransition
} from "@hardkas/artifacts";
import { systemRuntimeContext } from "@hardkas/core";
import {
  HardkasAccount,
  HardkasTxPlanSigner,
  SignTxPlanInput,
  SignTxPlanResult,
  HardkasSignerKind,
  HardkasKaspaPrivateKeyAccount
} from "./types.js";
import { HardkasConfig } from "@hardkas/config";
import { getKaspaSigningBackendStatus } from "./signer-backend.js";
import { KaspaWasmPrivateKeySigner } from "./kaspa-wasm-signer.js";

/**
 * Simulated signer for simnet development.
 * Produces deterministic signatures without real private keys.
 */
export class SimulatedTxPlanSigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "simulated";

  async signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult> {
    const plan = input.planArtifact as TxPlanArtifact;
    return {
      signatureKind: "simulated",
      signerAddress: plan.from.address,
      signedTransaction: {
        format: "simulated",
        payload: `simulated-signed-tx:${plan.planId}`
      }
    };
  }
}

/**
 * Placeholder for real Kaspa signing.
 */
export class UnsupportedRealKaspaSigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "unsupported";

  async signTxPlan(_input: SignTxPlanInput): Promise<SignTxPlanResult> {
    throw new Error(
      "Real Kaspa signing requires an official Kaspa transaction signing library. " +
        "No supported signer backend is configured."
    );
  }
}

/**
 * Main entry point for signing transaction plan artifacts.
 */
export async function signTxPlanArtifact(input: {
  planArtifact: TxPlanArtifact;
  account: HardkasAccount;
  config?: HardkasConfig;
  allowMainnet?: boolean;
}): Promise<SignedTxArtifact> {
  const { planArtifact, account } = input;

  // Security guardrails
  // In alpha, status might be missing if schema is used as the state marker
  const planRecord = planArtifact as Record<string, any>;
  if (planArtifact.schema === "hardkas.txPlan") {
    // Valid for signing
  } else if (planRecord.status !== "built" && planRecord.status !== "unsigned") {
    throw new Error(`Cannot sign artifact with status: ${planRecord.status}`);
  }

  // Account and plan mode matching
  if (planArtifact.mode === "simulated") {
    if (account.kind !== "simulated") {
      throw new Error(
        `Simulated plans must be signed with simulated accounts (account '${account.name}' is '${account.kind}').`
      );
    }
  } else {
    if (account.kind === "simulated") {
      throw new Error(
        `Real Kaspa transaction plans (mode: ${planArtifact.mode}) cannot be signed with simulated accounts.`
      );
    }
  }

  // Block mainnet by default for safety
  if (planArtifact.networkId === "mainnet" && !input.allowMainnet) {
    throw new Error(
      "Mainnet signing is disabled by default. Use --allow-mainnet-signing only if you understand the risks."
    );
  }

  if (account.kind === "simulated") {
    return createSimulatedSignedTxArtifact(
      planArtifact as TxPlan,
      `simulated-signed-tx:${planArtifact.planId}`,
      systemRuntimeContext
    ) as SignedTxArtifact;
  }

  if (account.kind === "kaspa-private-key") {
    const status = await getKaspaSigningBackendStatus();

    if (!status.available) {
      throw new Error(
        `Real Kaspa signing is not available: ${status.error || "Unknown error"}. Ensure 'kaspa' package is installed.`
      );
    }

    const signer = new KaspaWasmPrivateKeySigner({
      account: account as HardkasKaspaPrivateKeyAccount,
      allowMainnet: input.allowMainnet
    });

    const result = await signer.signTxPlan({
      planArtifact,
      accountName: account.name
    });

    const artifact: any = {
      schema: "hardkas.signedTx",
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      status: "signed",
      createdAt: new Date().toISOString(),
      txId: result.txId || "", // Ensure txId is present
      sourcePlanId: planArtifact.planId,
      networkId: planArtifact.networkId,
      mode: planArtifact.mode,
      from: { address: planArtifact.from.address },
      to: { address: planArtifact.to.address },
      amountSompi: planArtifact.amountSompi,
      signedTransaction: {
        format: result.signedTransaction?.format === "hex" ? "hex" : "unknown",
        payload: result.signedTransaction?.payload || ""
      },
      lineage: createLineageTransition(planArtifact, "hardkas.signedTx"),
      ...(planArtifact.workflowId ? { workflowId: planArtifact.workflowId } : {})
    };

    const contentHash = calculateContentHash(artifact);
    artifact.signedId = `signed-${contentHash.slice(0, 16)}`;
    artifact.contentHash = contentHash;
    if (artifact.lineage) {
      artifact.lineage.artifactId = contentHash;
    }

    return artifact;
  }

  if (account.kind === "external-wallet") {
    throw new Error("External wallet signing is not implemented yet.");
  }

  if (account.kind === "evm-private-key") {
    throw new Error(
      "EVM accounts are reserved for future Igra support and cannot sign Kaspa L1 transactions."
    );
  }

  const accountRecord = account as unknown as Record<string, string>;
  throw new Error(`Unsupported account kind for signing: ${accountRecord.kind}`);
}
