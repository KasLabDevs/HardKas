import { planPaymentWithGenerator, TxPlan, Utxo } from "@hardkas/tx-builder";
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

/**
 * Plans a local bridge entry: a payment carrying the bridge payload, planned and
 * priced (payload included) by the kaspa-wasm Generator. Local simulation only: the
 * identities are planned as the simulator's.
 */
export async function planBridgeEntry(request: BridgePlanRequest): Promise<BridgePlan> {
  const bridgePayload: BridgeEntryPayload = {
    marker: "IGRA",
    targetEvmAddress: request.targetEvmAddress,
    amountSompi: request.amountSompi,
    networkId: request.networkId
  };

  const serializedPayload = serializeBridgePayload(bridgePayload);

  const txPlan = await planPaymentWithGenerator({
    utxos: request.availableUtxos,
    outputs: [
      // In a real bridge, this might be a specific bridge multisig or script
      { address: request.fromAddress, amountSompi: request.amountSompi }
    ],
    changeAddress: request.fromAddress,
    payload: serializedPayload,
    syntheticIdentities: true
  });

  return {
    ...txPlan,
    bridgePayload,
    serializedPayload
  };
}
