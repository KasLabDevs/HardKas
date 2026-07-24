import { UTXO } from "@hardkas/core";
import { WalletProvider, WalletCapabilities, AddressQuery, UtxoQuery, TransactionSigner, SignTransactionRequest, SignTransactionResult } from "../contracts.js";

export class WatchOnlyWalletProvider implements WalletProvider, TransactionSigner {
  public readonly id = "watch-only";
  public readonly capabilities: WalletCapabilities = {
    canSign: false,
    watchOnly: true,
    supportsPartialSigning: false,
    supportsMessageSigning: false,
    supportsOfflineSigning: false,
    supportsBroadcast: true 
  };

  constructor(
    private network: string,
    private addresses: string[],
    private utxos: UTXO[]
  ) {}

  async getNetwork(): Promise<string> {
    return this.network;
  }

  async getAddresses(query?: AddressQuery): Promise<{ address: string }[]> {
    return this.addresses.map(a => ({ address: a }));
  }

  async getUtxos(query?: UtxoQuery): Promise<UTXO[]> {
    // Basic mock implementation. A real one would filter by query.addresses.
    return this.utxos; 
  }

  async signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult> {
    throw new Error("WatchOnlyWalletProvider cannot sign transactions.");
  }
}
