import { createHash } from "node:crypto";
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
 * Domain tag under which the registry keys below are computed. Publicly known
 * dev-only marker: any key computed under it is by construction NOT a production
 * key and MUST NOT hold real funds. Bumping this string is a breaking change to
 * every fixture address and requires updating the registry values in lockstep.
 */
export const HARDKAS_FIXTURE_DERIVATION_DOMAIN = "hardkas-dev-fixture:v1";

/**
 * The exhaustive, auditable set of HardKAS development fixture names.
 * Extending this set is a repo-visible change (add a name + its derived hex).
 * Anything not in this set fails closed at signer construction — HardKAS does
 * NOT expose a general "name → private key" derivation API to external callers.
 */
export const HARDKAS_FIXTURE_NAMES = [
  "default",
  "alice",
  "bob",
  "carol",
  "dave",
  "erin"
] as const;

export type HardkasFixtureName = (typeof HARDKAS_FIXTURE_NAMES)[number];

/**
 * Internal, module-private derivation used ONCE at load to populate the registry
 * below. Not exported. External callers do not get a general derivation API by
 * design (see rc.22 audit DEF-14 + Wave 0 design review): a bounded fixture set
 * is a narrower security surface than a name-keyed derivation function.
 */
function internalDeriveFixtureKeyHex(name: string): string {
  const material = `${HARDKAS_FIXTURE_DERIVATION_DOMAIN}\0${name}`;
  const hex = createHash("sha256").update(material, "utf8").digest("hex");
  if (/^0+$/.test(hex)) {
    throw new Error("FIXTURE_DERIVATION_DEGENERATE: derived key is zero (astronomically improbable).");
  }
  return hex;
}

/**
 * Read-only registry of fixture name → 32-byte private-key hex. Values are
 * derived once from the domain above and frozen. Consumers can audit each
 * entry by recomputing `sha256("hardkas-dev-fixture:v1\0<name>")`.
 */
export const HARDKAS_FIXTURE_REGISTRY: Readonly<Record<HardkasFixtureName, string>> =
  Object.freeze(
    HARDKAS_FIXTURE_NAMES.reduce(
      (acc, name) => {
        acc[name] = internalDeriveFixtureKeyHex(name);
        return acc;
      },
      {} as Record<HardkasFixtureName, string>
    )
  );

/**
 * Return the private-key hex for a registered fixture name.
 * Throws HARDKAS_UNKNOWN_FIXTURE when the name is not in the registry.
 */
export function getHardkasFixtureKey(fixtureName: HardkasFixtureName | string): string {
  if (!(fixtureName in HARDKAS_FIXTURE_REGISTRY)) {
    const known = HARDKAS_FIXTURE_NAMES.join(", ");
    const err = new Error(
      `HARDKAS_UNKNOWN_FIXTURE: '${fixtureName}' is not a registered dev fixture. ` +
      `Known fixtures: ${known}. HardKAS does not derive keys from arbitrary names; ` +
      `use 'hardkas accounts real generate' to create a fresh keypair with any name.`
    );
    (err as any).code = "HARDKAS_UNKNOWN_FIXTURE";
    throw err;
  }
  return HARDKAS_FIXTURE_REGISTRY[fixtureName as HardkasFixtureName];
}

/**
 * Deterministic fixture signer for HardKAS development on simnet/testnet.
 * Never to be used with real funds or mainnet.
 *
 * Historical note (rc.22 audit DEF-14 + Wave 0):
 * - Pre-Wave 0: a single RFC 6979 test-vector key was hard-coded; every
 *   fixture-named account collapsed to one identity.
 * - Wave 0 first pass: switched to arbitrary-name sha256 derivation.
 * - Wave 0 design review: rejected the arbitrary-name API — HardKAS does not
 *   introduce a general "human name → private key" scheme merely to solve test
 *   fixtures. The registry above is the entire fixture identity surface.
 */
export class HardkasFixtureSigner implements ExternalHardkasSigner {
  readonly networkId: string;
  readonly fixtureName: HardkasFixtureName;
  private cachedPrivateKeyHex: string | undefined;

  constructor(networkId: string = "simnet", fixtureName: HardkasFixtureName | string = "default") {
    this.networkId = networkId;
    if (networkId === "mainnet") {
      throw new Error("FixtureSigner cannot be used on mainnet.");
    }
    if (!(fixtureName in HARDKAS_FIXTURE_REGISTRY)) {
      const known = HARDKAS_FIXTURE_NAMES.join(", ");
      const err = new Error(
        `HARDKAS_UNKNOWN_FIXTURE: '${fixtureName}' is not a registered dev fixture. ` +
        `Known fixtures: ${known}. HardKAS does not derive keys from arbitrary names; ` +
        `use 'hardkas accounts real generate' to create a fresh keypair with any name.`
      );
      (err as any).code = "HARDKAS_UNKNOWN_FIXTURE";
      throw err;
    }
    this.fixtureName = fixtureName as HardkasFixtureName;
  }

  private privateKeyHex(): string {
    if (!this.cachedPrivateKeyHex) {
      this.cachedPrivateKeyHex = HARDKAS_FIXTURE_REGISTRY[this.fixtureName];
    }
    return this.cachedPrivateKeyHex;
  }

  private async loadKaspa(): Promise<any> {
    // The pinned managed SDK; WASM_TOOLCHAIN_NOT_INSTALLED / _INTEGRITY_FAILED propagate as is.
    return loadKaspaWasm();
  }

  async getAddress(): Promise<string> {
    const kaspa = await this.loadKaspa();
    const privKey = new kaspa.PrivateKey(this.privateKeyHex());
    return privKey.toKeypair().toAddress(this.networkId).toString();
  }

  async signTransaction(plan: TxPlanArtifact): Promise<SignedTxArtifact> {
    if (plan.networkId === "mainnet") {
      throw new Error("FixtureSigner refuses to sign mainnet transactions.");
    }
    const kaspa = await this.loadKaspa();
    const privateKey = new kaspa.PrivateKey(this.privateKeyHex());

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
