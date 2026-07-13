import { TxPlanArtifact } from "@hardkas/artifacts";

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
          const expectedAddress = (privateKey as any).toKeypair().toAddress(networkId).toString();
          
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
      try {
        const { KeystoreManager } = await import("./keystore.js");
        const { DEV_ACCOUNTS_PASSWORD } = await import("./dev-accounts.js");
        const keystore = await KeystoreManager.loadEncryptedKeystore((account as any).keystorePath);
        const unlock = await KeystoreManager.decryptEncryptedKeystore(keystore, DEV_ACCOUNTS_PASSWORD);
        if (unlock.success && unlock.payload) {
          pkValue = unlock.payload.privateKey;
        }
      } catch (e) {}
    }

    if (!pkValue) {
      throw new Error(`DEV_ACCOUNT_KEY_UNAVAILABLE: Missing required private key for account '${this.accountName}'.`);
    }

    const internalAuthorizer = new PrivateKeyAuthorizer(this.accountName, pkValue);
    return internalAuthorizer.authorize(context);
  }
}
