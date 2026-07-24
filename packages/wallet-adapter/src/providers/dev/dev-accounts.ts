import { UTXO } from "@hardkas/core";
import { 
    WalletProvider, 
    WalletCapabilities, 
    AddressQuery, 
    UtxoQuery, 
    TransactionSigner, 
    SignTransactionRequest, 
    SignTransactionResult 
} from "../../contracts.js";

// A provider designed specifically for simnet development.
// It abstracts away the DevServer / accounts logic from the rest of the application.
export class DevAccountsWalletProvider implements WalletProvider, TransactionSigner {
  public readonly id = "dev-accounts";
  public readonly capabilities: WalletCapabilities = {
    canSign: true,
    watchOnly: false,
    supportsPartialSigning: true,
    supportsMessageSigning: true,
    supportsOfflineSigning: true,
    supportsBroadcast: true 
  };

  constructor(
    private network: string = "simnet",
    // We can inject a dependency that knows how to fetch dev accounts and utxos
    private fetchUtxosFn: () => Promise<UTXO[]> = async () => [],
    private fetchAddressesFn: () => Promise<string[]> = async () => []
  ) {}

  async getNetwork(): Promise<string> {
    return this.network;
  }

  async getAddresses(query?: AddressQuery): Promise<{ address: string }[]> {
    const addrs = await this.fetchAddressesFn();
    return addrs.map(a => ({ address: a }));
  }

  async getUtxos(query?: UtxoQuery): Promise<UTXO[]> {
    return this.fetchUtxosFn();
  }

  async signTransaction(request: SignTransactionRequest): Promise<SignTransactionResult> {
    const { plan } = request;
    
    // In a real implementation this would use the private keys from the dev accounts.
    const signedInputs = plan.inputs.map((_, i) => i);

    return {
        artifact: JSON.stringify({
            payload: plan.unsignedPayload,
            signatures: ["dev-sig"]
        }),
        signedInputs,
        remainingInputs: []
    };
  }
}
