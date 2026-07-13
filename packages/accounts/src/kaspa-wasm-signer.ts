import { TxPlanArtifact, calculateContentHash } from "@hardkas/artifacts";
import {
  HardkasKaspaPrivateKeyAccount,
  HardkasTxPlanSigner,
  SignTxPlanInput,
  SignTxPlanResult,
  HardkasSignerKind
} from "./types.js";
import { NetworkId } from "@hardkas/core";
import { loadKaspaWasm, WasmProviderConfig } from "./signer-backend.js";
import { KeystoreManager } from "./keystore.js";
import { DEV_ACCOUNTS_PASSWORD } from "./dev-accounts.js";
import { parseWasmTxToRpc } from "./internal/wasm-rpc-serialization.js";



/**
 * Real Kaspa signer using the official WASM SDK.
 * Only works if the 'kaspa' package is installed.
 */
export class KaspaWasmPrivateKeySigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "kaspa-private-key";

  constructor(
    private options: {
      account?: HardkasKaspaPrivateKeyAccount;
      allowMainnet?: boolean | undefined;
      wasmConfig?: WasmProviderConfig;
    }
  ) {}

  async signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult> {
    const plan = input.planArtifact as TxPlanArtifact;

    // 1. Load SDK & Capabilities
    const sdk = await loadKaspaWasm(this.options.wasmConfig);
    const { detectCapabilities } = await import("./signer-backend.js");
    const capabilities = detectCapabilities(sdk);

    if (plan.computeBudget !== undefined || plan.outputs.some(o => o.covenant)) {
      if (!capabilities.transactionV1Signing) {
        throw new Error("Transaction V1 signing is not supported by the installed kaspa-wasm version");
      }
    }

    // 2. Mainnet guard
    assertSigningNetworkAllowed({
      network: plan.networkId,
      mode: plan.mode,
      allowMainnet: this.options.allowMainnet
    });

    // 3. Synthesize missing authorizers from account
    let authorizers = input.authorizers ? { ...input.authorizers } : {};
    const numInputs = plan.inputs?.length || (plan as any).selectedUtxos?.length || 0;
    
    if (this.options.account) {
        const account = this.options.account;
        let pkValue = account.privateKeyEnv ? process.env[account.privateKeyEnv] : undefined;

        if (!pkValue && (account as any).privateKey) {
          if (plan.networkId === "mainnet") {
            throw new Error(
              `Mainnet guard: Unsafe plaintext privateKey fallback is forbidden on mainnet for account '${account.name}'. Use privateKeyEnv instead.`
            );
          }
          pkValue = (account as any).privateKey;
        }

        if (!pkValue && account.keystorePath) {
          try {
            const KeystoreManager = (await import("./keystore.js")).KeystoreManager;
            const DEV_ACCOUNTS_PASSWORD = (await import("./dev-accounts.js")).DEV_ACCOUNTS_PASSWORD;
            const keystore = await KeystoreManager.loadEncryptedKeystore(account.keystorePath);
            const unlock = await KeystoreManager.decryptEncryptedKeystore(keystore, DEV_ACCOUNTS_PASSWORD);
            if (unlock.success && unlock.payload) {
              pkValue = unlock.payload.privateKey;
            }
          } catch (e) {}
        }

        if (!pkValue) {
          const err = new Error(`DEV_ACCOUNT_KEY_UNAVAILABLE: Missing required private key for account '${account.name}'.`);
          (err as any).code = "DEV_ACCOUNT_KEY_UNAVAILABLE";
          throw err;
        }

        if (typeof pkValue !== "string" || pkValue.trim() === "" || !/^[0-9a-fA-F]{64}$/.test(pkValue)) {
          const err = new Error("INVALID_PRIVATE_KEY_MATERIAL: Private key must be a valid 64-character hex string.");
          (err as any).code = "INVALID_PRIVATE_KEY_MATERIAL";
          throw err;
        }

        const expectedAddress = (new sdk.PrivateKey(pkValue) as any).toKeypair().toAddress(plan.networkId || "simnet").toString();
        const { PrivateKeyAuthorizer } = await import("./authorizers.js");
        const sourceInputs = plan.inputs || (plan as any).selectedUtxos || [];
        
        for (let i = 0; i < numInputs; i++) {
            if (!authorizers[i]) {
                const inputAddress = (sourceInputs[i] as any)?.address;
                if (inputAddress === expectedAddress) {
                    authorizers[i] = new PrivateKeyAuthorizer(account.name, pkValue);
                }
            }
        }
    }

    // 4. Verify all inputs have authorizers
    for (let i = 0; i < numInputs; i++) {
        if (!authorizers[i]) {
            throw new Error(`MISSING_INPUT_AUTHORIZER: No authorizer was provided for input index ${i}.`);
        }
    }

    try {
      console.log("DEBUG PLAN INPUTS:", JSON.stringify(plan.inputs || (plan as any).selectedUtxos, null, 2));

      const sourceInputs = plan.inputs || (plan as any).selectedUtxos || [];
      const utxos = sourceInputs.map((u: any) => {
        if (!u.outpoint.transactionId || u.outpoint.index === undefined) {
          throw new Error(`UTXO is missing transactionId or index. Re-run tx plan.`);
        }

        const spk = (u as { scriptPublicKey?: string }).scriptPublicKey;
        if (!spk) {
          throw new Error(
            "UTXO is missing scriptPublicKey. Real signing flows must never fabricate cryptographic state."
          );
        }

        return {
          address: plan.from.address,
          outpoint: {
            transactionId: u.outpoint.transactionId,
            index: u.outpoint.index
          },
          utxoEntry: {
            amount: BigInt(u.amountSompi),
            scriptPublicKey: new sdk.ScriptPublicKey(parseInt(spk.substring(0, 4), 16) || 0, spk.substring(4)),
            blockDaaScore: BigInt((u as any).blockDaaScore || "0"),
            isCoinbase: !!(u as any).isCoinbase
          }
        };
      });

      const priorityFee = BigInt(plan.estimatedFeeSompi);

      const createFreshTx = () => {
        let unsignedTx;

        if (plan.txVersion === 1) {
          if (!capabilities.transactionV1Signing) {
            throw new Error("Transaction V1 signing is not supported by the installed kaspa-wasm version");
          }

          // V1 `createTransaction` requires the change to be explicitly in the outputs array
          const allOutputs = [...plan.outputs];
          if (plan.change) {
            allOutputs.push({
              address: plan.change.address,
              amountSompi: plan.change.amountSompi
            });
          }

          const wasmOutputs = allOutputs.map((o, idx) => {
            if (!o.address) throw new Error("Output is missing address.");
            
            if (o.covenant && o.covenant.covenantId) {
              const hash = new sdk.Hash(o.covenant.covenantId);
              const binding = new sdk.CovenantBinding(o.covenant.authorizingInput, hash);
              return sdk.PaymentOutput.withCovenant(new sdk.Address(o.address), BigInt(o.amountSompi), binding);
            }
            
            return new sdk.PaymentOutput(new sdk.Address(o.address), BigInt(o.amountSompi));
          });

          console.log("DEBUG: Calling V1 createTransaction with:", { utxos: utxos.length, wasmOutputs: wasmOutputs.length, priorityFee });
          console.log("DEBUG KASPA-WASM PATH:", import.meta.resolve("kaspa-wasm"));
          console.log("DEBUG CREATE TRANSACTION FN:", sdk.createTransaction.toString());
          unsignedTx = sdk.createTransaction(
            utxos,
            wasmOutputs,
            priorityFee
          );

          // Group outputs with empty covenantId by authorizingInput to populate genesis covenants
          const genesisGroups = new Map<number, number[]>();
          allOutputs.forEach((o, idx) => {
            if (o.covenant && !o.covenant.covenantId) {
              const authIn = o.covenant.authorizingInput;
              if (!genesisGroups.has(authIn)) genesisGroups.set(authIn, []);
              genesisGroups.get(authIn)!.push(idx);
            }
          });

          if (genesisGroups.size > 0) {
            const groupsArray = Array.from(genesisGroups.entries()).map(([authIn, outIndices]) => {
              return new sdk.GenesisCovenantGroup(authIn, outIndices);
            });
            unsignedTx.populateGenesisCovenants(groupsArray);
          }
          unsignedTx.version = 1;

          if (plan.storageMass !== undefined) {
            unsignedTx.storageMass = BigInt(plan.storageMass);
          }

        } else {
          const allOutputs = [...plan.outputs];
          if (plan.change) {
            allOutputs.push({
              address: plan.change.address,
              amountSompi: plan.change.amountSompi
            });
          }

          const wasmOutputs = allOutputs.map((o) => {
            if (!o.address) throw new Error("Output is missing address.");
            return {
              address: o.address,
              amount: BigInt(o.amountSompi)
            };
          });

          console.log("DEBUG: Calling V0 createTransaction with:", { utxos: utxos.length, wasmOutputs: wasmOutputs.length, priorityFee });
          unsignedTx = sdk.createTransaction(
            utxos,
            wasmOutputs,
            priorityFee
          );
        }

        const inputs = unsignedTx.inputs;
        for (let i = 0; i < inputs.length; i++) {
          if (plan.computeBudget !== undefined) {
            const val = Number(plan.computeBudget);
            inputs[i].computeBudget = val;
          }
          if (unsignedTx.version === 1) {
            inputs[i].sigOpCount = 0;
          }
        }
        unsignedTx.inputs = inputs;
        console.log("DEBUG createFreshTx RETURNING:", unsignedTx?.constructor?.name);
        return unsignedTx;
      };

      // 5. Execute authorizers per input
      const inputOverrides: Record<number, { signatureScript: string }> = {};
      
      if (!authorizers || Object.keys(authorizers).length === 0) {
        throw new Error("MISSING_INPUT_AUTHORIZER: No authorizers were provided for the transaction.");
      }
      
      // Need a temporary transaction to get the number of inputs
      const dummyTx = createFreshTx();
      const numInputsWasm = dummyTx.inputs.length;
      
      for (let i = 0; i < numInputsWasm; i++) {
        const authorizer = authorizers[i];
        if (!authorizer) {
           throw new Error(`MISSING_INPUT_AUTHORIZER: No authorizer was provided for input index ${i}.`);
        }
        
        // Use a fresh transaction for each authorizer to avoid mutation side-effects
        const txForAuth = createFreshTx();
        
        const authorization = await authorizer.authorize({
          inputIndex: i,
          plan: plan,
          wasmTransaction: txForAuth,
          wasm: sdk
        });
        
        let sigScript: string | undefined;
        
        if (authorization.kind === "signature-script") {
          sigScript = authorization.signatureScript;
        } else if (authorization.kind === "wasm-signer") {
          sigScript = await authorization.signer.signInput({
            inputIndex: i,
            plan: plan,
            wasmTransaction: txForAuth,
            wasm: sdk
          });
        }
        
        if (!sigScript || sigScript.trim() === "") {
           throw new Error(`INVALID_SIGNATURE_SCRIPT: Authorizer for input ${i} failed to return a signatureScript.`);
        }
        
        if (!/^[0-9a-fA-F]+$/.test(sigScript)) {
           throw new Error(`INVALID_SIGNATURE_SCRIPT: Authorizer for input ${i} returned a non-hex signatureScript.`);
        }
        
        inputOverrides[i] = { signatureScript: sigScript };
      }
      
      // Final transaction for JSON serialization
      const finalTx = createFreshTx();
      const signedTx = finalTx;

      // 6. Serialize
      const wasmTxStr = typeof (signedTx as any).serializeToJSON === "function" 
        ? (signedTx as any).serializeToJSON() 
        : signedTx.toString();
      const rpcTx = parseWasmTxToRpc(wasmTxStr, signedTx, inputOverrides, plan);
      const rawTx = JSON.stringify(rpcTx);

      return {
        signatureKind: "kaspa-private-key",
        signerAddress: input.accountName || plan.from.address || "authorized",
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
      // Never log the private key
      console.error("DEBUG SIGNING ERROR:", error);
      throw new Error(
        `Kaspa WASM signing failed: ${error instanceof Error ? error.stack || error.message : JSON.stringify(error, Object.getOwnPropertyNames(error))}`
      );
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
