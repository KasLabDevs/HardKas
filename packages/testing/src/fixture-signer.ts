import {
  TxPlanArtifact,
  SignedTxArtifact,
  ExternalHardkasSigner,
  calculateContentHash,
  HARDKAS_VERSION,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION
} from "@hardkas/artifacts";

import {
  createBalancedTransaction,
  loadKaspaWasm,
  parseWasmTxToRpc,
  planOutputsWithChange,
  toWasmScriptPublicKey
} from "@hardkas/accounts";

/**
 * Deterministic fixture signer for Docker testing on simnet.
 * Never to be used with real funds or mainnet.
 */
export class HardkasFixtureSigner implements ExternalHardkasSigner {
  private networkId: string;
  // A deterministic, known private key exclusively for Docker tests.
  private readonly FIXTURE_PK =
    "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";

  constructor(networkId: string = "simnet") {
    this.networkId = networkId;
    if (networkId === "mainnet") {
      throw new Error("FixtureSigner cannot be used on mainnet.");
    }
  }

  private async loadKaspa(): Promise<any> {
    // The pinned managed SDK; WASM_TOOLCHAIN_NOT_INSTALLED / _INTEGRITY_FAILED propagate as is.
    return loadKaspaWasm();
  }

  async getAddress(): Promise<string> {
    const kaspa = await this.loadKaspa();
    const privKey = new kaspa.PrivateKey(this.FIXTURE_PK);
    return privKey.toKeypair().toAddress(this.networkId).toString();
  }

  async signTransaction(plan: TxPlanArtifact): Promise<SignedTxArtifact> {
    if (plan.networkId === "mainnet") {
      throw new Error("FixtureSigner refuses to sign mainnet transactions.");
    }
    const kaspa = await this.loadKaspa();
    const privateKey = new kaspa.PrivateKey(this.FIXTURE_PK);

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
          scriptPublicKey: toWasmScriptPublicKey(kaspa, spk),
          blockDaaScore: BigInt((u as any).blockDaaScore || "0"),
          isCoinbase: !!(u as any).isCoinbase
        }
      };
    });

    // Change is an explicit output and the values must balance (kaspa-wasm 2.x adds no change).
    const unsignedTx = createBalancedTransaction(kaspa, {
      utxos,
      outputs: planOutputsWithChange(plan as any),
      feeSompi: BigInt(plan.estimatedFeeSompi || "0")
    });

    const signedTx = kaspa.signTransaction(unsignedTx, [privateKey], true);

    const rawTx = JSON.stringify(parseWasmTxToRpc(signedTx.serializeToObject()));

    const draft: any = {
      schema: "hardkas.signedTx",
      schemaVersion: "hardkas.artifact.v1",
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: new Date().toISOString(),
      status: "signed",
      txId: signedTx.id,
      sourcePlanId: plan.planId,
      networkId: plan.networkId,
      mode: plan.mode,
      from: plan.from,
      to: plan.to,
      amountSompi: plan.amountSompi,
      unsignedPayloadHash: plan.contentHash,
      signedTransaction: {
        format: "hex",
        payload: rawTx
      },
      metadata: {
        signerBackend: "kaspa-wasm",
        fixture: true,
        networkGuard: "mainnet_rejected"
      },
      signatureMetadata: [
        {
          signer: "hardkas-local-docker-test-only",
          signedAt: new Date().toISOString()
        }
      ],
      lineage: {
        artifactId: "",
        lineageId: plan.lineage?.lineageId || plan.contentHash || "0".repeat(64),
        parentArtifactId: plan.contentHash || plan.planId,
        rootArtifactId: plan.lineage?.rootArtifactId || plan.contentHash || plan.planId
      }
    };

    const hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
    draft.signedId = `signed-${hash.slice(0, 16)}`;
    draft.contentHash = hash;
    if (draft.lineage) draft.lineage.artifactId = hash;

    return draft as SignedTxArtifact;
  }
}
