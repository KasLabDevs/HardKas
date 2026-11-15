import { TxPlanArtifact } from "@hardkas/artifacts";
import { getNetworkPrefix } from "@hardkas/core";

export interface TxInputAuthorizationContext {
  readonly inputIndex: number;
  readonly plan: TxPlanArtifact;
  readonly wasmTransaction: unknown;
  readonly wasm: any;
}

export type InputAuthorization =
  | {
      readonly kind: "signature-script";
      readonly signatureScript: string;
    }
  | {
      readonly kind: "wasm-signer";
      readonly signer: WasmInputSigner;
    };

export interface WasmInputSigner {
  signInput(context: TxInputAuthorizationContext): Promise<string> | string;
}

export interface TxInputAuthorizer {
  authorize(context: TxInputAuthorizationContext): Promise<InputAuthorization> | InputAuthorization;
}

export class StaticSignatureScriptAuthorizer implements TxInputAuthorizer {
  public constructor(private readonly signatureScript: string) {}

  public authorize(): InputAuthorization {
    return { 
      kind: "signature-script",
      signatureScript: this.signatureScript 
    };
  }
}

export class PrivateKeyAuthorizer implements TxInputAuthorizer {
  constructor(
    public readonly accountName: string,
    public readonly privateKeyHex: string
  ) {}

  authorize(context: TxInputAuthorizationContext): InputAuthorization {
    const planInput = context.plan.inputs[context.inputIndex];
    if (!planInput) {
      throw new Error(`INVALID_AUTHORIZER_INPUT_INDEX: Input index ${context.inputIndex} does not exist in plan.`);
    }

    return {
      kind: "wasm-signer",
      signer: {
        signInput: async (ctx) => {
          const { wasm, wasmTransaction, inputIndex } = ctx;
          const privateKey = new wasm.PrivateKey(this.privateKeyHex);
          const networkId = context.plan.networkId || "simnet";
          const expectedAddress = (privateKey as any).toKeypair().toAddress(getNetworkPrefix(networkId)).toString();
          
          if ((planInput as any).address && expectedAddress !== (planInput as any).address) {
            throw new Error(
              `PRIVATE_KEY_DOES_NOT_CONTROL_INPUT: The provided private key for account '${this.accountName}' derives to address '${expectedAddress}', but input ${context.inputIndex} is controlled by '${(planInput as any).address}'.`
            );
          }

          const tx = wasmTransaction as any;
          try {
            const signedTx = wasm.signTransaction(tx, [privateKey], false);
            const sigScript = (signedTx.inputs as any[])[inputIndex].signatureScript;
            
            if (!sigScript || sigScript.length === 0) {
               throw new Error(`UNAUTHORIZED_TRANSACTION_INPUT: Kaspa WASM failed to generate a signature script for input ${inputIndex} using account '${this.accountName}'.`);
            }
            
            const sigScriptHex = typeof sigScript === "string" ? sigScript : Buffer.from(sigScript).toString("hex");
            return sigScriptHex;
          } catch (e: any) {
            throw new Error(`UNAUTHORIZED_TRANSACTION_INPUT: Failed to sign input ${inputIndex} with PrivateKeyAuthorizer: ${e.message}`);
          }
        }
      }
    };
  }
}

/** ECDSA spends · what an ECDSA signer is: a WasmInputSigner that says it signs ECDSA P2PK inputs. */
export interface EcdsaWasmInputSigner extends WasmInputSigner {
  readonly scheme: "ecdsa";
}

function authorizerError(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code, ...extra });
}

/**
 * ECDSA spends · signs an ECDSA P2PK input (script `21 <33-byte compressed key> ab`) with one key: RFC 6979, low-S, over
 * rusty-kaspa's calc_ecdsa_signature_hash of the transaction as built (core signKaspaInputEcdsa; kaspa-wasm 2.1.0 has no
 * ECDSA input signer). The input's UTXO script decides, never an address string: it must be this key's ECDSA P2PK
 * script (INPUT_KEY_SCHEME_MISMATCH for a Schnorr input, PRIVATE_KEY_DOES_NOT_CONTROL_INPUT for another key's). The
 * unlocking script is one 65-byte push (the 64-byte signature and SIGHASH_ALL), as for Schnorr.
 */
export class EcdsaPrivateKeyAuthorizer implements TxInputAuthorizer {
  constructor(
    public readonly accountName: string,
    private readonly privateKeyHex: string
  ) {}

  authorize(context: TxInputAuthorizationContext): InputAuthorization {
    if (!context.plan.inputs[context.inputIndex]) {
      throw new Error(`INVALID_AUTHORIZER_INPUT_INDEX: Input index ${context.inputIndex} does not exist in plan.`);
    }
    const key = this.privateKeyHex;
    const accountName = this.accountName;
    const signer: EcdsaWasmInputSigner = {
      scheme: "ecdsa",
      signInput: async (ctx) => {
        const { ecdsaCompressedPublicKey, kaspaSighashInputsFromWasm, signKaspaInputEcdsa } = await import("@hardkas/core");
        const { tx, utxos } = kaspaSighashInputsFromWasm((ctx.wasmTransaction as any).serializeToObject());
        const utxo = utxos[ctx.inputIndex];
        if (!utxo) throw authorizerError("UTXO_ENTRY_MISSING", `input ${ctx.inputIndex} carries no UTXO entry to sign against`, { input: ctx.inputIndex });
        const ecdsaScript = /^21(02|03)[0-9a-f]{64}ab$/;
        if (utxo.scriptPublicKey.version !== 0 || !ecdsaScript.test(utxo.scriptPublicKey.script)) {
          throw authorizerError(
            "INPUT_KEY_SCHEME_MISMATCH",
            `input ${ctx.inputIndex} is not an ECDSA P2PK input (its UTXO script is not 21 <33-byte key> ab); the ECDSA key of account '${accountName}' does not sign it`,
            { input: ctx.inputIndex }
          );
        }
        if (utxo.scriptPublicKey.script !== `21${ecdsaCompressedPublicKey(key)}ab`) {
          throw authorizerError(
            "PRIVATE_KEY_DOES_NOT_CONTROL_INPUT",
            `the ECDSA key of account '${accountName}' is not the key input ${ctx.inputIndex}'s script commits to`,
            { input: ctx.inputIndex }
          );
        }
        // OP_DATA_65 <64-byte compact signature ‖ SIGHASH_ALL>
        return `41${signKaspaInputEcdsa({ tx, inputIndex: ctx.inputIndex, utxo, privateKey: key })}`;
      }
    };
    return { kind: "wasm-signer", signer };
  }
}

/** Whether an authorization's signer signs ECDSA (EcdsaPrivateKeyAuthorizer); any other signer signs Schnorr (kaspa-wasm). */
export function isEcdsaInputSigner(authorization: InputAuthorization): boolean {
  return authorization.kind === "wasm-signer" && (authorization.signer as Partial<EcdsaWasmInputSigner>).scheme === "ecdsa";
}

export class LazyAccountAuthorizer implements TxInputAuthorizer {
  public constructor(
    public readonly accountName: string,
    private readonly workspaceRoot: string
  ) {}

  public async authorize(context: TxInputAuthorizationContext): Promise<InputAuthorization> {
    const { resolveHardkasAccount } = await import("./resolve.js");
    const account = await resolveHardkasAccount({
      nameOrAddress: this.accountName,
      config: { cwd: this.workspaceRoot } as any
    });

    let pkValue = (account as any).privateKeyEnv ? process.env[(account as any).privateKeyEnv] : undefined;

    if (!pkValue && (account as any).privateKey) {
      pkValue = (account as any).privateKey;
    }

    if (!pkValue && (account as any).keystorePath) {
      // Development accounts only open with the development password; this path takes no other.
      const { unlockAccountKeystore } = await import("./kaspa-wasm-signer.js");
      pkValue = await unlockAccountKeystore(
        { name: this.accountName, keystorePath: (account as any).keystorePath, keystoreKind: (account as any).keystoreKind },
        undefined
      );
    }

    if (!pkValue) {
      throw new Error(`DEV_ACCOUNT_KEY_UNAVAILABLE: Missing required private key for account '${this.accountName}'.`);
    }

    const internalAuthorizer = new PrivateKeyAuthorizer(this.accountName, pkValue);
    return internalAuthorizer.authorize(context);
  }
}
