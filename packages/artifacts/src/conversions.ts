import type { Utxo, TxOutput } from "@hardkas/tx-builder";
import type { UtxoArtifact, TxOutputArtifact } from "./types.js";

/**
 * Converts a domain Utxo to a UtxoArtifact for persistence.
 */
export function utxoToArtifact(utxo: Utxo): UtxoArtifact {
  return {
    outpoint: {
      transactionId: utxo.outpoint.transactionId as import("@hardkas/core").TxId,
      index: utxo.outpoint.index
    },
    address: utxo.address as import("@hardkas/core").KaspaAddress,
    amountSompi: utxo.amountSompi.toString(),
    scriptPublicKey: utxo.scriptPublicKey,
    ...(utxo.blockDaaScore !== undefined ? { blockDaaScore: utxo.blockDaaScore.toString() } : {}),
    ...(utxo.isCoinbase !== undefined ? { isCoinbase: utxo.isCoinbase } : {})
  };
}

/**
 * Converts a UtxoArtifact back to a domain Utxo.
 */
export function utxoFromArtifact(artifact: UtxoArtifact): Utxo {
  return {
    outpoint: {
      transactionId: artifact.outpoint.transactionId,
      index: artifact.outpoint.index
    },
    address: artifact.address,
    amountSompi: safeParseBigInt(artifact.amountSompi, "UtxoArtifact.amountSompi"),
    scriptPublicKey: artifact.scriptPublicKey,
    ...(artifact.blockDaaScore !== undefined ? { blockDaaScore: safeParseBigInt(artifact.blockDaaScore, "UtxoArtifact.blockDaaScore") } : {}),
    ...(artifact.isCoinbase !== undefined ? { isCoinbase: artifact.isCoinbase } : {})
  };
}

/**
 * Converts a domain TxOutput to a TxOutputArtifact for persistence.
 */
export function txOutputToArtifact(output: TxOutput): TxOutputArtifact {
  return {
    address: output.address,
    amountSompi: output.amountSompi.toString()
  };
}

/**
 * Converts a TxOutputArtifact back to a domain TxOutput.
 */
export function txOutputFromArtifact(artifact: TxOutputArtifact): TxOutput {
  return {
    address: artifact.address,
    amountSompi: safeParseBigInt(artifact.amountSompi, "TxOutputArtifact.amountSompi")
  };
}

function safeParseBigInt(val: string, context: string): bigint {
  try {
    return BigInt(val);
  } catch (e) {
    throw new Error(`Invalid BigInt string in ${context}: '${val}'`);
  }
}
