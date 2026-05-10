import { 
  getBroadcastableSignedTransaction, 
  SignedTxArtifact,
  TxReceiptArtifact,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";
import { coreEvents } from "@hardkas/core";
import { 
  resolveNetworkTarget, 
  HardkasConfig 
} from "@hardkas/config";
import { 
  JsonWrpcKaspaClient
} from "@hardkas/kaspa-rpc";
import { 
  loadOrCreateLocalnetState, 
  saveLocalnetState, 
  applySimulatedPayment,
  saveSimulatedReceipt,
  saveSimulatedTrace,
  StoredTraceEvent
} from "@hardkas/localnet";
import { assertBroadcastNetworkAllowed } from "../broadcast-guard.js";

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
  formatted: string;
}

/**
 * Reusable logic for transaction broadcasting (Unified L1).
 */
export async function runTxSend(input: TxSendRunnerInput): Promise<TxSendRunnerResult> {
  const { signedArtifact, network, config, url } = input;
  
  const broadcastable = getBroadcastableSignedTransaction(signedArtifact);
  const networkName = network || signedArtifact.networkId;
  const { name: resolvedName, target } = resolveNetworkTarget({ network: networkName, config });

  // 1. Simulated Mode
  if (target.kind === "simulated") {
    const state = await loadOrCreateLocalnetState();
    
    const startTime = Date.now();
    const events: StoredTraceEvent[] = [
      { type: "phase.started", phase: "send", timestamp: startTime },
    ];

    const simResult = applySimulatedPayment(state, {
      from: signedArtifact.from.input || signedArtifact.from.address,
      to: signedArtifact.to.input || signedArtifact.to.address,
      amountSompi: BigInt(signedArtifact.amountSompi),
    });

    coreEvents.normalizeAndEmit({
      kind: "workflow.submitted",
      txId: simResult.receipt.txId,
      endpoint: "simulated://local"
    } as any);

    events.push({ type: "phase.completed", phase: "send", timestamp: Date.now() });

    await saveLocalnetState(simResult.state);
    const receiptPath = await saveSimulatedReceipt(simResult.receipt);

    // Create unified receipt
    const receipt: TxReceiptArtifact = {
      schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      networkId: resolvedName,
      mode: "simulated",
      createdAt: new Date().toISOString(),
      status: "confirmed",
      txId: simResult.receipt.txId,
      sourceSignedId: signedArtifact.signedId,
      from: { address: signedArtifact.from.address },
      to: { address: signedArtifact.to.address },
      amountSompi: signedArtifact.amountSompi,
      feeSompi: simResult.receipt.feeSompi,
      daaScore: simResult.receipt.daaScore.toString(),
      submittedAt: simResult.receipt.createdAt,
      confirmedAt: simResult.receipt.createdAt,
      rpcUrl: "simulated://local"
    };

    const tracePath = await saveSimulatedTrace({
      schema: ARTIFACT_SCHEMAS.TX_TRACE,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      createdAt: receipt.createdAt,
      txId: receipt.txId,
      mode: "simulated",
      networkId: resolvedName,
      events,
      receiptPath
    });

    receipt.tracePath = tracePath;

    return {
      accepted: true,
      txId: receipt.txId,
      rpcUrl: url || "simulated://local",
      networkName: resolvedName,
      receipt,
      receiptPath,
      formatted: `Transaction sent in simulated localnet\nTx ID: ${receipt.txId}\nReceipt: ${receiptPath}`
    };
  }

  // 2. Real Mode (Node/RPC)
  assertBroadcastNetworkAllowed({
    artifactNetworkId: signedArtifact.networkId,
    selectedNetwork: networkName
  });

  const rpcUrl = url || (target as any).rpcUrl;
  if (!rpcUrl) throw new Error(`No RPC URL found for network '${networkName}'.`);

  const client = new JsonWrpcKaspaClient({ rpcUrl });
  try {
    const txId = (broadcastable.rawTransaction as any)?.id || "unknown";
    
    coreEvents.normalizeAndEmit({
      kind: "workflow.submitted",
      txId,
      endpoint: rpcUrl
    } as any);

    const result = await client.submitTransaction(broadcastable.rawTransaction);
    
    const receipt: TxReceiptArtifact = {
      schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      networkId: resolvedName,
      mode: "real",
      createdAt: new Date().toISOString(),
      status: result.accepted ? "submitted" : "failed",
      txId: (result.transactionId || "failed") as any,
      sourceSignedId: signedArtifact.signedId,
      from: { address: signedArtifact.from.address },
      to: { address: signedArtifact.to.address },
      amountSompi: signedArtifact.amountSompi,
      feeSompi: signedArtifact.metadata?.estimatedFeeSompi || "0",
      submittedAt: new Date().toISOString(),
      rpcUrl
    };

    return {
      accepted: !!result.accepted,
      txId: receipt.txId,
      rpcUrl,
      networkName: resolvedName,
      receipt,
      formatted: result.accepted 
        ? `Kaspa transaction broadcast\nNetwork: ${resolvedName}\nTx ID:   ${receipt.txId}`
        : `Transaction failed: ${JSON.stringify(result.raw)}`
    };
  } finally {
    await client.close();
  }
}
