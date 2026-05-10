import { 
  RealTxSigner, 
  RealTxSigningInput, 
  RealTxSigningResult 
} from "./real-signer.js";
import { loadKaspaWasm } from "./signer-backend.js";
import { UtxoArtifact } from "@hardkas/artifacts";

export interface KaspaSdkRealTxSignerOptions {
  readonly sdkLoader?: () => Promise<any>;
}

export class KaspaSdkRealTxSigner implements RealTxSigner {
  private readonly sdkLoader: () => Promise<any>;

  constructor(options?: KaspaSdkRealTxSignerOptions) {
    this.sdkLoader = options?.sdkLoader || loadKaspaWasm;
  }

  async sign(input: RealTxSigningInput): Promise<RealTxSigningResult> {
    const { plan, account } = input;
    
    let sdk;
    try {
      sdk = await this.sdkLoader();
    } catch (e) {
      throw new Error("Kaspa SDK real transaction signer dependency is not installed. Install/configure the supported Kaspa WASM SDK adapter.");
    }

    if (!sdk) {
      throw new Error("Kaspa SDK real transaction signer dependency is not installed. Install/configure the supported Kaspa WASM SDK adapter.");
    }

    // Safety checks (redundant with runner but good to have)
    if (!account.privateKey) {
      throw new Error("Account has no private key available for signing.");
    }

    if (plan.from.address !== account.address) {
      throw new Error(`Address mismatch: Plan requires ${plan.from.address}, but account has ${account.address}.`);
    }

    try {
      // 1. Prepare Private Key
      const privateKey = new sdk.PrivateKey(account.privateKey);

      // 2. Prepare UTXOs
      const utxos = plan.inputs.map((u: any) => {
        if (!u.scriptPublicKey) {
          throw new Error(`UTXO ${u.outpoint.transactionId}:${u.outpoint.index} is missing scriptPublicKey required for signing.`);
        }
        const spk = u.scriptPublicKey;

        return new sdk.UtxoEntry(
          BigInt(u.amountSompi),
          spk,
          u.outpoint.transactionId,
          u.outpoint.index,
          plan.from.address
        );
      });

      // 3. Prepare Outputs
      const outputs = [
        new sdk.PaymentOutput(
          new sdk.Address(plan.to.address),
          BigInt(plan.amountSompi)
        )
      ];

      // 4. Prepare Change
      const changeAddress = (plan as any).change 
        ? new sdk.Address((plan as any).change.address)
        : undefined;

      // 5. Build and Sign
      const priorityFee = BigInt(plan.estimatedFeeSompi);

      const unsignedTx = sdk.createTransaction(
        utxos,
        outputs,
        changeAddress,
        priorityFee
      );

      const signedTx = sdk.signTransaction(unsignedTx, [privateKey], true);

      // 6. Serialize result
      const payload = signedTx.serialize ? signedTx.serialize() : JSON.stringify(signedTx.toRpcTransaction());
      const txId = signedTx.id;

      return {
        signedTransaction: {
          format: "kaspa-sdk",
          payload
        },
        txId
      };

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("is not a constructor") || msg.includes("is not a function")) {
        throw new Error(`Kaspa SDK signer adapter could not find required transaction signing primitives: ${msg}`);
      }
      throw new Error(`Real transaction signing failed in Kaspa SDK: ${msg}`);
    }
  }
}
