import { UTXO } from "@hardkas/core";
import { TxPlan } from "@hardkas/tx-builder";

export interface WalletCapabilities {
  readonly canSign: boolean;
  readonly watchOnly: boolean;
  readonly supportsPartialSigning: boolean;
  readonly supportsMessageSigning: boolean;
  readonly supportsOfflineSigning: boolean;
  readonly supportsBroadcast: boolean;
}

export interface AddressQuery {
    types?: string[]; // e.g. ["P2PK", "P2SH"]
    // Future extensions...
}

export interface UtxoQuery {
    addresses?: string[];
    minConfirmations?: number;
    // Future extensions...
}

export interface WalletProvider {
  readonly id: string;
  readonly capabilities: WalletCapabilities;

  getNetwork(): Promise<string>;
  getAddresses(query?: AddressQuery): Promise<{ address: string }[]>;
  getUtxos(query?: UtxoQuery): Promise<UTXO[]>;
}

export interface SignTransactionRequest {
    plan: TxPlan;
}

export interface SignTransactionResult {
    artifact: string; // The signed payload representation (JSON string for now, could be hex or object)
    signedInputs: number[];
    remainingInputs: number[];
}

export interface TransactionSigner {
  signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult>;
}

export interface TransactionBroadcaster {
  broadcastTransaction(transaction: { signedArtifact: string }): Promise<{
      txId: string;
      accepted: boolean;
  }>;
}
