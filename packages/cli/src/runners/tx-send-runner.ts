import { SignedTxArtifact, TxReceiptArtifact } from "@hardkas/artifacts";
import { resolveNetworkTarget, HardkasConfig } from "@hardkas/config";
import { assertBroadcastNetworkAllowed } from "../broadcast-guard.js";
import { Hardkas } from "@hardkas/sdk";

export interface TxSendRunnerInput {
  signedArtifact: SignedTxArtifact;
  network?: string;
  config: HardkasConfig;
  url?: string;
}

export interface TxSendRunnerResult {
  accepted: boolean;
  txId: string;
  rpcUrl: string;
  networkName: string;
  receipt: TxReceiptArtifact;
  receiptPath?: string;
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
  const { name: resolvedName, target } = resolveNetworkTarget({ network: networkName, config });

  // Initialize the SDK
  const loadedConfig = { cwd: input.workspaceRoot || process.cwd(), path: "", config };
  loadedConfig.config.defaultNetwork = resolvedName;
  const sdk = new (Hardkas as any)(loadedConfig);

  // 1. Simulated Mode
  if (target.kind === "simulated" || signedArtifact.mode === "simulated") {
    const { receipt, receiptPath } = await sdk.tx.simulate(signedArtifact);

    return {
      accepted: true,
      txId: receipt.txId,
      rpcUrl: url || "simulated://local",
      networkName: resolvedName,
      receipt,
      receiptPath,
      executionId: `exec_${Date.now().toString(36)}`,
      replayId: `replay_${receipt.txId.substring(0,8)}`
    };
  }

  // 2. Real Mode (Node/RPC)
  assertBroadcastNetworkAllowed({
    artifactNetworkId: signedArtifact.networkId,
    selectedNetwork: networkName
  });

  const rpcUrl = url || (target as any).rpcUrl;
  if (!rpcUrl) throw new Error(`No RPC URL found for network '${networkName}'.`);

  const { receipt, receiptPath } = await sdk.tx.send(signedArtifact, rpcUrl);

  return {
    accepted: receipt.status === "submitted" || receipt.status === "confirmed",
    txId: receipt.txId,
    rpcUrl,
    networkName: resolvedName,
    receipt,
    receiptPath,
    executionId: `exec_${Date.now().toString(36)}`,
    replayId: `replay_${receipt.txId.substring(0,8)}`
  };
}
