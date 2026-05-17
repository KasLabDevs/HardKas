import { buildPaymentPlan, TxPlan, Utxo } from "@hardkas/tx-builder";
import { serializeBridgePayload, BridgeEntryPayload } from "./payload.js";
import { NetworkId } from "@hardkas/core";

export interface BridgePlanRequest {
  readonly fromAddress: string;
  readonly targetEvmAddress: string;
  readonly amountSompi: bigint;
  readonly networkId: NetworkId;
  readonly availableUtxos: readonly Utxo[];
}

export interface BridgePlan extends TxPlan {
  readonly bridgePayload: BridgeEntryPayload;
  readonly serializedPayload: string;
}

export function planBridgeEntry(request: BridgePlanRequest): BridgePlan {
  const bridgePayload: BridgeEntryPayload = {
    marker: "IGRA",
    targetEvmAddress: request.targetEvmAddress,
    amountSompi: request.amountSompi,
    networkId: request.networkId
  };

  const serializedPayload = serializeBridgePayload(bridgePayload);
  const payloadBytes = serializedPayload.length / 2;

  const txPlan = buildPaymentPlan({
    fromAddress: request.fromAddress,
    outputs: [
      // In a real bridge, this might be a specific bridge multisig or script
      { address: request.fromAddress, amountSompi: request.amountSompi } 
    ],
    availableUtxos: request.availableUtxos,
    feeRateSompiPerMass: 1n,
    payloadBytes
  });

  return {
    ...txPlan,
    bridgePayload,
    serializedPayload
  };
}
