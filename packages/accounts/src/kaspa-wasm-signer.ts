import { TxPlanArtifact, calculateContentHash } from "@hardkas/artifacts";
import {
  HardkasKaspaPrivateKeyAccount,
  HardkasTxPlanSigner,
  SignTxPlanInput,
  SignTxPlanResult,
  HardkasSignerKind
} from "./types.js";
import { NetworkId } from "@hardkas/core";
import { loadKaspaWasm } from "./signer-backend.js";
import { KeystoreManager } from "./keystore.js";
import { DEV_ACCOUNTS_PASSWORD } from "./dev-accounts.js";

function toHex(arr: Uint8Array): string {
  return Buffer.from(arr).toString("hex");
}

function parseWasmTxToRpc(wasmTxStr: string): any {
  let parsed = JSON.parse(wasmTxStr);
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  const txInner = parsed.tx ? parsed.tx.inner : parsed.inner;
  if (!txInner) throw new Error("Could not find inner tx data");

  return {
    version: txInner.version || 0,
    inputs: (txInner.inputs || []).map((i: any) => ({
      previousOutpoint: {
        transactionId: i.inner.previousOutpoint.inner.transactionId,
        index: i.inner.previousOutpoint.inner.index
      },
      signatureScript: toHex(i.inner.signatureScript),
      sequence: i.inner.sequence || 0,
      sigOpCount: i.inner.sigOpCount || 1
    })),
    outputs: (txInner.outputs || []).map((o: any) => ({
      amount: o.inner.value.toString(),
      scriptPublicKey: {
        version: parseInt(o.inner.scriptPublicKey.substring(0, 4), 16) || 0,
        scriptPublicKey: o.inner.scriptPublicKey.substring(4)
      }
    })),
    lockTime: txInner.lockTime || 0,
    subnetworkId: txInner.subnetworkId || "0000000000000000000000000000000000000000",
    gas: txInner.gas || 0,
    payload: txInner.payload && txInner.payload.length > 0 ? toHex(txInner.payload) : ""
  };
}

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

    // 1. Load SDK & Capabilities
    const sdk = await loadKaspaWasm();
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

    // 3. Resolve Private Key
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
        const keystore = await KeystoreManager.loadEncryptedKeystore(
          account.keystorePath
        );
        const unlock = await KeystoreManager.decryptEncryptedKeystore(
          keystore,
          DEV_ACCOUNTS_PASSWORD
        );
        if (unlock.success && unlock.payload) {
          pkValue = unlock.payload.privateKey;
        }
      } catch (e) {
        // Fallthrough to the error below
      }
    }

    if (!pkValue) {
      const err = new Error(
        `DEV_ACCOUNT_KEY_UNAVAILABLE: Missing required private key for account '${account.name}'.`
      );
      (err as any).code = "DEV_ACCOUNT_KEY_UNAVAILABLE";
      throw err;
    }

    if (
      typeof pkValue !== "string" ||
      pkValue.trim() === "" ||
      !/^[0-9a-fA-F]{64}$/.test(pkValue)
    ) {
      const err = new Error(
        "INVALID_PRIVATE_KEY_MATERIAL: Private key must be a valid 64-character hex string."
      );
      (err as any).code = "INVALID_PRIVATE_KEY_MATERIAL";
      throw err;
    }

    try {
      // 4. Map Artifact to SDK objects
      const privateKey = new sdk.PrivateKey(pkValue);

      const utxos = plan.inputs.map((u) => {
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
            scriptPublicKey: spk,
            blockDaaScore: BigInt((u as any).blockDaaScore || "0"),
            isCoinbase: !!(u as any).isCoinbase
          }
        };
      });

      const outputs = plan.outputs.map((o) => {
        if (!o.address) throw new Error("Output is missing address.");
        return {
          address: o.address,
          amount: BigInt(o.amountSompi)
        };
      });

      const changeAddress = plan.change?.address
        ? new sdk.Address(plan.change.address)
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
      const rawTx = JSON.stringify(parseWasmTxToRpc(signedTx.toString()));

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
      throw new Error(
        `Kaspa WASM signing failed: ${error instanceof Error ? error.message : String(error)}`
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
