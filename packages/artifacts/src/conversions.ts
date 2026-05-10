import type { Utxo, TxOutput } from "@hardkas/tx-builder";
import type { UtxoArtifact, TxOutputArtifact } from "./types.js";

/**
 * Converts a domain Utxo to a UtxoArtifact for persistence.
 */
export function utxoToArtifact(utxo: Utxo): UtxoArtifact {
  const artifact: any = {
    outpoint: {
      transactionId: utxo.outpoint.transactionId,
      index: utxo.outpoint.index
    },
    address: utxo.address,
    amountSompi: utxo.amountSompi.toString(),
    scriptPublicKey: utxo.scriptPublicKey
  };

  if (utxo.blockDaaScore !== undefined) {
    artifact.blockDaaScore = utxo.blockDaaScore.toString();
  }
  if (utxo.isCoinbase !== undefined) {
    artifact.isCoinbase = utxo.isCoinbase;
  }

  return artifact as UtxoArtifact;
}

/**
 * Converts a UtxoArtifact back to a domain Utxo.
 */
export function utxoFromArtifact(artifact: UtxoArtifact): Utxo {
  const utxo: any = {
    outpoint: {
      transactionId: artifact.outpoint.transactionId,
      index: artifact.outpoint.index
    },
    address: artifact.address,
    amountSompi: safeParseBigInt(artifact.amountSompi, "UtxoArtifact.amountSompi"),
    scriptPublicKey: artifact.scriptPublicKey
  };

  if (artifact.blockDaaScore !== undefined) {
    utxo.blockDaaScore = safeParseBigInt(artifact.blockDaaScore, "UtxoArtifact.blockDaaScore");
  }
  if (artifact.isCoinbase !== undefined) {
    utxo.isCoinbase = artifact.isCoinbase;
  }

  return utxo as Utxo;
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
