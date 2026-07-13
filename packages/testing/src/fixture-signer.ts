import {
  TxPlanArtifact,
  SignedTxArtifact,
  ExternalHardkasSigner,
  calculateContentHash,
  HARDKAS_VERSION,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION
} from "@hardkas/artifacts";

import { parseWasmTxToRpc } from "@hardkas/accounts/internal/wasm-rpc-serialization.js";

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
    try {
      // @ts-ignore - Third party lib lacking types
      return await import("kaspa-wasm");
    } catch (e: unknown) {
      const err = new Error(
        "SIGNER_BACKEND_UNAVAILABLE: Official Kaspa WASM backend is required to sign transactions.\nInstall it via: npm install kaspa-wasm"
      );
      (err as any).code = "SIGNER_BACKEND_UNAVAILABLE";
      throw err;
    }
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

    let changeAddress;
    if ((plan as any).change && (plan as any).change.address) {
      changeAddress = new kaspa.Address((plan as any).change.address);
    } else {
      changeAddress = new kaspa.Address(plan.from.address); // fallback to sender
    }

    const priorityFee = BigInt(plan.estimatedFeeSompi || "0");

    const unsignedTx = kaspa.createTransaction(
      utxos,
      outputs,
      changeAddress,
      priorityFee
    );

    const signedTx = kaspa.signTransaction(unsignedTx, [privateKey], true);

    console.log("SIGNED TX TOSTRING:", signedTx.toString());
    const rawTx = JSON.stringify(parseWasmTxToRpc(signedTx.toString()));

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
