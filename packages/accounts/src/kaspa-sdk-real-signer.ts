import { RealTxSigner, RealTxSigningInput, RealTxSigningResult } from "./real-signer.js";
import { loadKaspaWasm } from "./signer-backend.js";

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

      // 2. Prepare UTXOs as POJOs (kaspa-wasm 0.13 expects plain objects, not UtxoEntry instances)
      const utxos = plan.inputs.map((u: any) => {
        if (!u.scriptPublicKey) {
          throw new Error(
            `UTXO ${u.outpoint.transactionId}:${u.outpoint.index} is missing scriptPublicKey required for signing.`
          );
        }

        // The RPC adapter prepends a 4-char version hex (e.g. "0000") to the script.
        // ScriptPublicKey constructor expects (version: number, script: hex_string_without_version).
        let spkHex = String(u.scriptPublicKey);
        let spkVersion = 0;
        if (spkHex.length >= 68) {
          // First 4 chars = version in hex (e.g. "0000" = version 0)
          spkVersion = parseInt(spkHex.slice(0, 4), 16) || 0;
          spkHex = spkHex.slice(4);
        }

        return {
          address: account.address,
          outpoint: {
            transactionId: u.outpoint.transactionId,
            index: u.outpoint.index
          },
          utxoEntry: {
            amount: BigInt(u.amountSompi),
            scriptPublicKey: new sdk.ScriptPublicKey(spkVersion, spkHex),
            blockDaaScore: BigInt(u.blockDaaScore ?? 0),
            isCoinbase: u.isCoinbase ?? false
          }
        };
      });

      // 3. Prepare Outputs from plan.outputs
      const outputs = plan.outputs.map((o: any) =>
        new sdk.PaymentOutput(new sdk.Address(o.address), BigInt(o.amountSompi))
      );

      // 4. Change Address — createTransaction expects a string, not an Address instance
      const changeAddress = plan.change
        ? plan.change.address
        : account.address;

      // 5. Build unsigned transaction
      const priorityFee = BigInt(plan.estimatedFeeSompi);

      const unsignedTx = sdk.createTransaction(
        utxos,
        outputs,
        changeAddress,
        priorityFee
      );

      // 6. Sign
      const signedTx = sdk.signTransaction(unsignedTx, [privateKey], true);

      // 7. Extract result from SignableTransaction
      // signTransaction returns a SignableTransaction with .tx (Transaction) property
      const innerTx = signedTx.tx;
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
