import { UTXO } from "@hardkas/core";
import { 
    WalletProvider, 
    WalletCapabilities, 
    AddressQuery, 
    UtxoQuery, 
    TransactionSigner, 
    SignTransactionRequest, 
    SignTransactionResult 
} from "../contracts.js";

export class InMemoryWalletProvider implements WalletProvider, TransactionSigner {
  public readonly id = "in-memory";
  public readonly capabilities: WalletCapabilities = {
    canSign: true,
    watchOnly: false,
    supportsPartialSigning: true,
    supportsMessageSigning: true,
    supportsOfflineSigning: true,
    supportsBroadcast: false
  };

  // In a real implementation this would hold private keys.
  // For the agnostic proof, it holds addresses and mock UTXOs.
  constructor(
    private network: string,
    private ownedAddresses: string[],
    private utxos: UTXO[]
  ) {}

  async getNetwork(): Promise<string> {
    return this.network;
  }

  async getAddresses(query?: AddressQuery): Promise<{ address: string }[]> {
    return this.ownedAddresses.map(a => ({ address: a }));
  }

  async getUtxos(query?: UtxoQuery): Promise<UTXO[]> {
    return this.utxos;
  }

  async signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult> {
    const { plan } = request;
    
    // Check if the signer owns all the inputs it's supposed to sign.
    // In our mock, we just check if there's any input we are asked to sign.
    // Real implementation would check scriptPublicKeys against owned private keys.
    // Let's pretend it can sign all inputs provided in the plan for this mock, 
    // unless the plan contains an input that we don't own (we'd need scriptPublicKey matching).
    // For test purposes, let's just return a signed artifact if all is well.
    const signedInputs = plan.inputs.map((_, i) => i);

    return {
        artifact: JSON.stringify({
            payload: plan.unsignedPayload,
            signatures: ["mock-sig"]
        }),
        signedInputs,
        remainingInputs: []
    };
  }
}
