import { NetworkId } from "@hardkas/core";

export interface BridgeEntryPayload {
  readonly marker: string; // e.g. "IGRA"
  readonly targetEvmAddress: string;
  readonly amountSompi: bigint;
  readonly networkId: NetworkId;
  readonly nonce?: number;
}

/**
 * Deterministically serializes a bridge entry payload to hex.
 */
export function serializeBridgePayload(payload: BridgeEntryPayload): string {
  // Format: [MARKER(4 bytes)][EVM_ADDR(20 bytes)][AMOUNT(8 bytes)][NETWORK(2 bytes)][NONCE(4 bytes)]
  // This is a simplified deterministic model for simulation.
  
  const markerHex = Buffer.from(payload.marker.padEnd(4).slice(0, 4)).toString("hex");
  const addrHex = payload.targetEvmAddress.replace("0x", "").toLowerCase().padStart(40, "0");
  const amountHex = payload.amountSompi.toString(16).padStart(16, "0");
  const networkHex = Buffer.from(payload.networkId.padEnd(2).slice(0, 2)).toString("hex");
  const nonceHex = (payload.nonce ?? 0).toString(16).padStart(8, "0");

  return `${markerHex}${addrHex}${amountHex}${networkHex}${nonceHex}`;
}

export function deserializeBridgePayload(hex: string): BridgeEntryPayload {
  const marker = Buffer.from(hex.slice(0, 8), "hex").toString().trim();
  const targetEvmAddress = `0x${hex.slice(8, 48)}`;
  const amountSompi = BigInt(`0x${hex.slice(48, 64)}`);
  const networkId = Buffer.from(hex.slice(64, 68), "hex").toString().trim() as NetworkId;
  const nonce = parseInt(hex.slice(68, 76), 16);

  return { marker, targetEvmAddress, amountSompi, networkId, nonce };
}
