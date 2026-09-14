import { RealTxSigner, RealTxSigningInput, RealTxSigningResult } from "./real-signer.js";
import { loadKaspaWasm } from "./signer-backend.js";
import { createBalancedTransaction, planOutputsWithChange, toWasmScriptPublicKey } from "./wasm-transaction.js";

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
    } catch (e: any) {
      if (typeof e?.code === "string" && e.code.startsWith("WASM_TOOLCHAIN_")) throw e;
      throw new Error(
        "Kaspa SDK real transaction signer dependency is not installed. Install/configure the supported Kaspa WASM SDK adapter."
      );
    }

    if (!sdk) {
      throw new Error(
        "Kaspa SDK real transaction signer dependency is not installed. Install/configure the supported Kaspa WASM SDK adapter."
      );
    }

    // Safety checks
    if (!account.privateKey) {
      throw new Error("Account has no private key available for signing.");
    }

    try {
      // 1. Prepare Private Key
      const privateKey = new sdk.PrivateKey(account.privateKey);

      // 2. Prepare UTXOs as plain objects carrying a ScriptPublicKey instance
      const utxos = plan.inputs.map((u: any) => {
        if (!u.scriptPublicKey) {
          throw new Error(
            `UTXO ${u.outpoint.transactionId}:${u.outpoint.index} is missing scriptPublicKey required for signing.`
          );
        }

        return {
          address: account.address,
          outpoint: {
            transactionId: u.outpoint.transactionId,
            index: u.outpoint.index
          },
          utxoEntry: {
            amount: BigInt(u.amountSompi),
            scriptPublicKey: toWasmScriptPublicKey(sdk, u.scriptPublicKey),
            blockDaaScore: BigInt(u.blockDaaScore ?? 0),
            isCoinbase: u.isCoinbase ?? false
          }
        };
      });

      // 3-5. Outputs plus explicit change; the SDK adds none, and the values must balance.
      const unsignedTx = createBalancedTransaction(sdk, {
        utxos,
        outputs: planOutputsWithChange(plan),
        feeSompi: BigInt(plan.estimatedFeeSompi)
      });

      // 6. Sign
      const signedTx = sdk.signTransaction(unsignedTx, [privateKey], true);

      // 7. kaspa-wasm 2.x returns the signed Transaction itself
      const innerTx = signedTx;
      const txId = innerTx?.id;
      const payload = JSON.stringify(
        innerTx.toJSON(),
        (_k: string, v: unknown) => typeof v === "bigint" ? v.toString() : v
      );

      return {
        signedTransaction: {
          format: "kaspa-sdk",
          payload,
          raw: innerTx
        } as any,
        txId
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("is not a constructor") || msg.includes("is not a function")) {
        throw new Error(
          `Kaspa SDK signer adapter could not find required transaction signing primitives: ${msg}`
        );
      }
      throw new Error(`Real transaction signing failed in Kaspa SDK: ${msg}`);
    }
  }
}
