import { 
  TxPlanArtifact, 
  calculateContentHash
} from "@hardkas/artifacts";
import { 
  HardkasKaspaPrivateKeyAccount, 
  HardkasTxPlanSigner, 
  SignTxPlanInput, 
  SignTxPlanResult, 
  HardkasSignerKind 
} from "./types.js";
import { NetworkId } from "@hardkas/core";
import { loadKaspaWasm } from "./signer-backend.js";

/**
 * Real Kaspa signer using the official WASM SDK.
 * Only works if the 'kaspa' package is installed.
 */
export class KaspaWasmPrivateKeySigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "kaspa-private-key";

  constructor(
    private options: {
      account: HardkasKaspaPrivateKeyAccount;
      allowMainnet?: boolean | undefined;
    }
  ) {}

  async signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult> {
    const plan = input.planArtifact as TxPlanArtifact;
    const account = this.options.account;

    // 1. Load SDK
    const sdk = await loadKaspaWasm();

    // 2. Mainnet guard
    assertSigningNetworkAllowed({
      network: plan.networkId,
      mode: plan.mode,
      allowMainnet: this.options.allowMainnet
    });

    // 3. Resolve Private Key
    const pkValue = account.privateKeyEnv ? process.env[account.privateKeyEnv] : undefined;
    if (!pkValue) {
      throw new Error(`Missing required private key for account '${account.name}'.`);
    }

    try {
      // 4. Map Artifact to SDK objects
      const privateKey = new sdk.PrivateKey(pkValue);
      
      const utxos = plan.inputs.map(u => {
        if (!u.outpoint.transactionId || u.outpoint.index === undefined) {
          throw new Error(`UTXO is missing transactionId or index. Re-run tx plan.`);
        }
        
        // Note: scriptPublicKey is now optional in v2 or handled differently
        const spk = (u as any).scriptPublicKey || "mock-script"; 
        
        return new sdk.UtxoEntry(
          BigInt(u.amountSompi),
          spk,
          u.outpoint.transactionId,
          u.outpoint.index,
          plan.from.address
        );
      });

      const outputs = plan.outputs.map(o => {
        if (!o.address) throw new Error("Output is missing address.");
        return new sdk.PaymentOutput(
          new sdk.Address(o.address),
          BigInt(o.amountSompi)
        );
      });

      const changeAddress = (plan as any).change?.address 
        ? new sdk.Address((plan as any).change.address)
        : undefined;

      const priorityFee = BigInt(plan.estimatedFeeSompi);

      // 5. Create and Sign Transaction
      const unsignedTx = sdk.createTransaction(
        utxos,
        outputs,
        changeAddress,
        priorityFee
      );

      const signedTx = sdk.signTransaction(unsignedTx, [privateKey], true);
      
      // 6. Serialize
      const rawTx = signedTx.serialize ? signedTx.serialize() : JSON.stringify(signedTx.toRpcTransaction());

      return {
        signatureKind: "kaspa-private-key",
        signerAddress: account.address || privateKey.toAddress(plan.networkId).toString(),
        signedTransaction: {
          format: "hex",
          payload: rawTx
        },
        txId: signedTx.id,
        signature: {
          // We use the txid as the signature identifier in the artifact
          value: signedTx.id || calculateContentHash(plan)
        }
      };

    } catch (error) {
      // Never log the private key or pkValue
      throw new Error(`Kaspa WASM signing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Security guard for network types.
 */
export function assertSigningNetworkAllowed(input: {
  network: NetworkId;
  mode: string;
  allowMainnet?: boolean | undefined;
}): void {
  const isMainnet = input.network === "mainnet";
  
  if (isMainnet && !input.allowMainnet) {
    throw new Error(
      "Mainnet signing is disabled by default. " +
      "Use --allow-mainnet-signing only if you understand the risks."
    );
  }
}
