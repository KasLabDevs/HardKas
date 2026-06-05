import { SignedTxArtifact, TxReceiptArtifact } from "@hardkas/artifacts";
import { resolveNetworkTarget, HardkasConfig } from "@hardkas/config";
import { assertBroadcastNetworkAllowed } from "../broadcast-guard.js";
import { Hardkas } from "@hardkas/sdk";

export interface TxSendRunnerInput {
  signedArtifact: SignedTxArtifact;
  network?: string;
  config: HardkasConfig;
  url?: string;
  provider?: string;
  workspaceRoot?: string;
}

export interface TxSendRunnerResult {
  accepted: boolean;
  txId: string;
  rpcUrl: string;
  networkName: string;
  receipt: TxReceiptArtifact;
  receiptPath?: string | undefined;
  executionId?: string;
  replayId?: string;
}

/**
 * CLI Runner for transaction broadcasting.
 * Delegates core logic to the HardKAS SDK.
 */
export async function runTxSend(input: TxSendRunnerInput): Promise<TxSendRunnerResult> {
  const { signedArtifact, network, config, url } = input;

  const networkName = network || signedArtifact.networkId;
  const { name: resolvedName, target } = resolveNetworkTarget({
    network: networkName,
    config
  });

  const { resolveProvider } = await import("@hardkas/config");
  const provider = resolveProvider({
    network: resolvedName,
    provider: input.provider,
    url
  });

  // Initialize the SDK
  const sdk = await Hardkas.open({ cwd: input.workspaceRoot || process.cwd() });
  sdk.config.config.defaultNetwork = resolvedName;

  // 1. Simulated Mode
  if (provider.mode === "simulated" && signedArtifact.mode !== "real") {
    const { receipt, receiptPath } = await sdk.tx.simulate(signedArtifact);

    return {
      accepted: true,
      txId: receipt.txId,
      rpcUrl: url || "simulated://local",
      networkName: resolvedName,
      receipt,
      receiptPath,
      executionId: `exec_${Date.now().toString(36)}`,
      replayId: `replay_${receipt.txId.substring(0, 8)}`
    };
  }

  // 2. Real Mode (Node/RPC)
  assertBroadcastNetworkAllowed({
    artifactNetworkId: signedArtifact.networkId,
    selectedNetwork: networkName
  });

  const targetRecord = target as unknown as Record<string, unknown>;
  const targetRpcUrl =
    typeof targetRecord["rpcUrl"] === "string" ? targetRecord["rpcUrl"] : undefined;
  const rpcUrl = url || targetRpcUrl || provider.endpoint;
  if (!rpcUrl) throw new Error(`No RPC URL found for network '${networkName}'.`);

  // Override the SDK RPC client for real mode since default simnet creates a simulated provider
  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  (sdk as any).rpc = new JsonWrpcKaspaClient({ rpcUrl: rpcUrl });

  const { receipt, receiptPath } = await sdk.tx.send(signedArtifact, rpcUrl);

  return {
    accepted: receipt.status === "submitted" || receipt.status === "confirmed",
    txId: receipt.txId,
    rpcUrl,
    networkName: resolvedName,
    receipt,
    receiptPath,
    executionId: `exec_${Date.now().toString(36)}`,
    replayId: `replay_${receipt.txId.substring(0, 8)}`
  };
}
