import { SignedTxArtifact, TxReceiptArtifact, TxSubmissionArtifact } from "@hardkas/artifacts";
import { resolveExecutionTarget, HardkasConfig, declaredNodeEndpoint, resolveNodeEndpoint } from "@hardkas/config";
import { assertBroadcastNetworkAllowed } from "../broadcast-guard.js";
import { Hardkas } from "@hardkas/sdk";
import { sendOutcome } from "./next-steps.js";

export interface TxSendRunnerInput {
  targetName?: string;
  signedArtifact: SignedTxArtifact;
  network?: string;
  config: HardkasConfig;
  url?: string;
  provider?: string;
  workspaceRoot?: string;
  sync?: boolean;
}

export interface TxSendRunnerResult {
  /**
   * Decided from an authenticated field only (a submission's result or a FULL-scope receipt's status) — or, for a
   * transaction this workspace had already submitted, from the FULL-scope observation that found the node holds it.
   */
  accepted: boolean;
  txId: string;
  rpcUrl: string;
  networkName: string;
  /** A simulated receipt, or the immutable txSubmission.v1 of a real broadcast (R-iii part 1). */
  receipt: TxReceiptArtifact | TxSubmissionArtifact;
  receiptPath?: string | undefined;
  executionId?: string;
  /**
   * TX-SEND-IDEMPOTENT-1: the transaction had already been submitted from this workspace and the node holds it — nothing
   * was broadcast; `receipt` is the recorded submission and `state` the derived state one observation found.
   */
  alreadySubmitted?: boolean;
  state?: string;
}

/**
 * CLI Runner for transaction broadcasting.
 * Delegates core logic to the HardKAS SDK.
 */
export async function runTxSend(input: TxSendRunnerInput): Promise<TxSendRunnerResult> {
  const { targetName, signedArtifact, network, config, url } = input;

  const { resolveArtifactTarget, resolveLegacyArtifactTarget, resolveProvider } = await import("@hardkas/config");
  const { LegacyArtifactRequiresExplicitResolutionError } = await import("@hardkas/core");

  let resolvedName: string;
  let execution: any;
  let target: any;

  try {
    const { target: artifactTarget } = resolveArtifactTarget({ artifact: signedArtifact as any });
    execution = artifactTarget;
  } catch (e: any) {
    if (e.name === "LegacyArtifactRequiresExplicitResolutionError") {
      console.warn("⚠️ [Legacy] Artifact lacks execution identity. Inferring target from configuration.");
      const { target: legacyTarget } = resolveLegacyArtifactTarget({ artifact: signedArtifact as any, config });
      execution = legacyTarget;
    } else {
      throw e;
    }
  }

  if (targetName) {
    // WORKSPACE-AUTHORITY-2: the named target is looked up by the shared resolver (typed EXECUTION_TARGET_NOT_FOUND)
    const { resolveWorkspaceExecution } = await import("@hardkas/config");
    const explicitTarget = resolveWorkspaceExecution({ config, target: targetName }).execution;

    if (
      execution.domain !== explicitTarget.domain ||
      execution.mode !== explicitTarget.mode ||
      execution.network !== explicitTarget.network
    ) {
      throw new Error(`EXECUTION_TARGET_MISMATCH: Execution target mismatch. Signed artifact requires ${execution.mode} on ${execution.network}, but --target specified ${explicitTarget.mode} on ${explicitTarget.network}.`);
    }
    execution = explicitTarget;
  }

  resolvedName = execution.network;
  target = config.networks?.[resolvedName] || {};

  if (network && execution.network !== network) {
    throw new Error(`EXECUTION_NETWORK_MISMATCH: Target specifies network '${execution.network}', but command was called with legacy --network '${network}'.`);
  }

  const networkName = execution.network;

  const provider = resolveProvider({
    network: resolvedName,
    provider: input.provider,
    url,
    executionMode: execution.mode,
    // WORKSPACE-AUTHORITY-2 (closeout): the endpoint the resolved network declares, the same the SDK uses
    // (TESTNET-PORT-COLLISION-1, D-TPC-2: declared by the USER; a built-in public entry declares none)
    networkRpcUrl: declaredNodeEndpoint(config, resolvedName)
  });

  // ENFORCE EXECUTION COMPATIBILITY FOR BROADCASTING/SIMULATION
  const { assertExecutionCompatibility } = await import("@hardkas/core");
  assertExecutionCompatibility({
    operation: provider.mode === "simulator" ? "simulate" : "send",
    target: execution,
    artifact: { execution: signedArtifact.execution }
  });

  // Initialize the SDK
  const sdk = await Hardkas.open({ cwd: input.workspaceRoot || process.cwd(), network: resolvedName });

  try {
    // 1. Simulated Mode
    if (provider.mode === "simulator" && signedArtifact.mode !== "real") {
      const { receipt, receiptPath } = await sdk.tx.simulate(signedArtifact);

      return {
        accepted: sendOutcome(receipt).accepted,
        txId: receipt.txId,
        rpcUrl: url || "simulated://local",
        networkName: resolvedName,
        receipt,
        receiptPath,
        executionId: `exec_${Date.now().toString(36)}`
      };
    }

    // 2. Real Mode (Node/RPC)
    assertBroadcastNetworkAllowed({
      artifactNetworkId: signedArtifact.networkId,
      selectedNetwork: networkName
    });

    // TESTNET-PORT-COLLISION-1: the shared endpoint authority — `--url`, else the declared endpoint (the provider's, which
    // is a local network's default too), else NETWORK_ENDPOINT_REQUIRED, typed, before any connection
    const rpcUrl = resolveNodeEndpoint({ config, networkId: resolvedName, explicitUrl: url || provider.endpoint }).url;

    // Override the SDK RPC client for real mode since default simnet creates a simulated provider
    const { JsonWrpcKaspaClient, KaspaWrpcClient } = await import("@hardkas/kaspa-rpc");
    const isWebSocket = rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://");
    // NODE-NETWORK-IDENTITY-1: a signed transaction is sent only to a node that says it serves the transaction's network
    const expectedNetworkId = String(signedArtifact.networkId ?? resolvedName);
    const rpcClient = isWebSocket
      ? new KaspaWrpcClient(rpcUrl, { expectedNetworkId })
      : new JsonWrpcKaspaClient({ rpcUrl: rpcUrl, expectedNetworkId });
    if (isWebSocket) {
      await (rpcClient as InstanceType<typeof KaspaWrpcClient>).connect();
    }
    (sdk as any).rpc = rpcClient;

    try {
      const { receipt, receiptPath, alreadySubmitted, derived } = await sdk.tx.send(signedArtifact, rpcUrl);

      // R-iii part 1 / IC-2′.8: the outcome comes from the submission's
      // authenticated submit result, never from a status field.
      // TX-SEND-IDEMPOTENT-1: a re-send the SDK answered with the recorded submission (the node holds the transaction)
      // was not broadcast; it succeeds on that observation.
      return {
        accepted: alreadySubmitted === true || sendOutcome(receipt).accepted,
        txId: receipt.txId,
        rpcUrl,
        networkName: resolvedName,
        receipt,
        receiptPath,
        executionId: `exec_${Date.now().toString(36)}`,
        ...(alreadySubmitted ? { alreadySubmitted: true, ...(derived ? { state: derived.status } : {}) } : {})
      };
    } finally {
      if (rpcClient) {
        if ("disconnect" in rpcClient && typeof (rpcClient as any).disconnect === "function") {
          await (rpcClient as any).disconnect();
        } else if ("close" in rpcClient && typeof (rpcClient as any).close === "function") {
          await (rpcClient as any).close();
        }
      }
    }
  } finally {
    // RESOURCE-LIFECYCLE-1 (RL-I1/RL-I3): the SDK opened above is released whatever the send ends with; the client
    // handed to it above is released by the inner finally, never by sdk.close().
    await sdk.close();
  }
}
