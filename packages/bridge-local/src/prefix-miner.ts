import { serializeBridgePayload, BridgeEntryPayload } from "./payload.js";
import { calculateContentHash } from "@hardkas/artifacts";

export interface MiningResult {
  readonly nonce: number;
  readonly hash: string;
  readonly attempts: number;
}

/**
 * Simulates prefix mining by incrementing a nonce until the deterministic hash
 * of the payload matches the desired prefix.
 */
export function simulatePrefixMining(
  payloadBase: Omit<BridgeEntryPayload, "nonce">,
  prefix: string,
  options: { 
    initialNonce?: number; 
    maxAttempts?: number;
    timeoutMs?: number;
  } = {}
): MiningResult {
  const initialNonce = options.initialNonce ?? 0;
  const maxAttempts = options.maxAttempts ?? 100000;
  const timeoutMs = options.timeoutMs ?? 5000;
  const startTime = Date.now();

  let nonce = initialNonce;
  let attempts = 0;

  while (attempts < maxAttempts) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Mining simulation timed out after ${timeoutMs}ms`);
    }

    const payload = { ...payloadBase, nonce };
    const serialized = serializeBridgePayload(payload);
    
    const hash = calculateContentHash({ payload: serialized });
    
    if (hash.startsWith(prefix)) {
      return { nonce, hash, attempts: attempts + 1 };
    }

    nonce++;
    attempts++;
  }

  throw new Error(`Failed to find prefix "${prefix}" after ${attempts} attempts.`);
}
