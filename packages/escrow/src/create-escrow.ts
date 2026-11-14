import crypto from "node:crypto";
import {
  compileSilverScript,
  getSilContract,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  type SilArtifactValue
} from "@hardkas/core";
import {
  ESCROW_CONTRACT_NAME,
  ESCROW_FULL_SOURCE,
  ESCROW_SPLIT_CONTRACT_NAME,
  ESCROW_SPLIT_SOURCE,
  ESCROW_V1_CONTRACT_NAME,
  ESCROW_V1_SOURCE
} from "./escrow-source.js";
import type { EscrowArtifact, EscrowCompileProvenance, EscrowConfig, EscrowState, EscrowVersion, EscrowMode } from "./types.js";

export { ESCROW_CONTRACT_NAME, ESCROW_SPLIT_CONTRACT_NAME, ESCROW_V1_CONTRACT_NAME } from "./escrow-source.js";

export type EscrowErrorCode =
  | "ESCROW_CONFIG_INVALID"
  | "ESCROW_SILVERC_UNAVAILABLE"
  | "ESCROW_SILVERC_FAILED"
  | "ESCROW_ARTIFACT_INVALID";

export class EscrowError extends Error {
  constructor(readonly code: EscrowErrorCode, message: string, readonly cause?: unknown) {
    super(`${code}: ${message}`);
    this.name = "EscrowError";
  }
}

const HEX = /^(?:[0-9a-fA-F]{2})+$/;

function pubkeyArg(role: string, hex: unknown): SilArtifactValue {
  const h = typeof hex === "string" ? hex.replace(/^0x/, "") : "";
  if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new EscrowError("ESCROW_CONFIG_INVALID", `${role} public key must be a 32-byte x-only Schnorr key (64 hex characters)`);
  }
  return { kind: "bytes", value: Buffer.from(h, "hex") };
}

/** A destination as the contract compares it: version 0 followed by the script. */
function destinationArg(name: string, spk: unknown): SilArtifactValue {
  const h = typeof spk === "string" ? spk.replace(/^0x/, "") : "";
  if (!HEX.test(h)) throw new EscrowError("ESCROW_CONFIG_INVALID", `${name} must be a script public key in hex`);
  return { kind: "bytes", value: Buffer.concat([Buffer.from([0, 0]), Buffer.from(h, "hex")]) };
}

function amountArg(name: string, value: unknown): SilArtifactValue {
  let n: bigint;
  try {
    n = BigInt(value as any);
  } catch {
    throw new EscrowError("ESCROW_CONFIG_INVALID", `${name} is not an integer amount`);
  }
  if (n <= 0n) throw new EscrowError("ESCROW_CONFIG_INVALID", `${name} must be positive`);
  return { kind: "int", value: n };
}

function nonceArg(nonceHex?: string): { arg: SilArtifactValue; hex: string } {
  let h = nonceHex ? nonceHex.replace(/^0x/, "") : "";
  if (!h) {
    h = crypto.randomBytes(32).toString("hex");
  } else if (!/^[0-9a-fA-F]{64}$/.test(h)) {
    throw new EscrowError("ESCROW_CONFIG_INVALID", "escrowNonce must be a 32-byte hex string (64 characters)");
  }
  return { arg: { kind: "bytes", value: Buffer.from(h, "hex") }, hex: h.toLowerCase() };
}

/**
 * C-10 · what an escrow config means: its contract version, its mode and the amounts its branches pay. The ONE reading
 * of a config, used by createEscrow (what is compiled) and escrowResolution (what each branch must pay), so the two can
 * never disagree:
 *  - version: `config.version`, else "v2" (EscrowFull or EscrowSplit); a legacy v1 escrow says `version: "v1"`;
 *  - mode (v2): `config.mode`, else "split" when both buyerAmount and sellerAmount are given, else "full";
 *  - v1: refundAmount and releaseAmount, each paid by its own branch;
 *  - v2 split: buyerAmount (else refundAmount) and sellerAmount (else releaseAmount);
 *  - v2 full: ONE principal. principal, refundAmount and releaseAmount all name it (the legacy two map to it), so every
 *    one of them the config gives must be the same amount: different ones are ESCROW_CONFIG_INVALID (an EscrowFull
 *    compiled with one of them could never pay the other).
 * Every amount is a positive integer (ESCROW_CONFIG_INVALID otherwise).
 */
export interface EscrowTerms {
  readonly version: EscrowVersion;
  readonly mode: EscrowMode;
  /** v1: what refundBuyer pays the buyer. */
  readonly refundAmount?: bigint;
  /** v1: what releaseToSeller pays the seller. */
  readonly releaseAmount?: bigint;
  /** v2 split: the buyer's allocation. */
  readonly buyerAmount?: bigint;
  /** v2 split: the seller's allocation. */
  readonly sellerAmount?: bigint;
  /** v2 full: the principal every branch pays. */
  readonly principal?: bigint;
}

export function escrowTermsOf(config: EscrowConfig): EscrowTerms {
  const amount = (name: string, value: unknown): bigint => amountArg(name, value).value as bigint;
  const version: EscrowVersion = config?.version ?? "v2";
  if (version !== "v1" && version !== "v2") throw new EscrowError("ESCROW_CONFIG_INVALID", `version must be "v1" or "v2", got ${JSON.stringify(version)}`);
  const mode: EscrowMode = config?.mode ?? (config?.buyerAmount !== undefined && config?.sellerAmount !== undefined ? "split" : "full");
  if (mode !== "full" && mode !== "split") throw new EscrowError("ESCROW_CONFIG_INVALID", `mode must be "full" or "split", got ${JSON.stringify(mode)}`);
  if (version === "v1") {
    return { version, mode, refundAmount: amount("refundAmount", config.refundAmount), releaseAmount: amount("releaseAmount", config.releaseAmount) };
  }
  if (mode === "split") {
    return {
      version,
      mode,
      buyerAmount: amount("buyerAmount", config.buyerAmount ?? config.refundAmount),
      sellerAmount: amount("sellerAmount", config.sellerAmount ?? config.releaseAmount)
    };
  }
  const named = (["principal", "refundAmount", "releaseAmount"] as const)
    .filter((name) => config[name] !== undefined)
    .map((name) => [name, amount(name, config[name])] as const);
  if (named.length === 0) {
    throw new EscrowError("ESCROW_CONFIG_INVALID", "a v2 full escrow (EscrowFull) needs its principal: give principal (refundAmount or releaseAmount are read as it too)");
  }
  if (new Set(named.map(([, v]) => v)).size > 1) {
    throw new EscrowError(
      "ESCROW_CONFIG_INVALID",
      `a v2 full escrow (EscrowFull) has one principal, and this config names different amounts for it (${named.map(([n, v]) => `${n} ${v}`).join(", ")}): ` +
        `its contract could never pay the others. Give principal alone, or version "v1" for a legacy escrow whose refund and release amounts differ`
    );
  }
  return { version, mode, principal: named[0]![1] };
}

export interface CreateEscrowOptions {
  /** Network the P2SH address is derived for (default simnet). */
  readonly networkId?: string | undefined;
  /** HARDKAS_HOME override for locating the managed silverc. */
  readonly home?: string | undefined;
}

/**
 * Compiles the escrow contract for these parties with the managed silverc
 * v1.0.0 and derives its P2SH lock from the SDK.
 */
export async function createEscrow(
  config: EscrowConfig,
  options: CreateEscrowOptions = {}
): Promise<{
  state: EscrowState;
  artifact: EscrowArtifact;
  provenance: EscrowCompileProvenance;
  compiled: { constructorArgs: readonly SilArtifactValue[]; artifactBytes: Uint8Array };
  effectiveConfig: EscrowConfig;
}> {
  // Validate all amounts present in config up front
  if (config.refundAmount !== undefined) amountArg("refundAmount", config.refundAmount);
  if (config.releaseAmount !== undefined) amountArg("releaseAmount", config.releaseAmount);
  if (config.principal !== undefined) amountArg("principal", config.principal);
  if (config.buyerAmount !== undefined) amountArg("buyerAmount", config.buyerAmount);
  if (config.sellerAmount !== undefined) amountArg("sellerAmount", config.sellerAmount);

  // C-10: the one reading of the config that escrowResolution uses too
  const terms = escrowTermsOf(config);
  const version: EscrowVersion = terms.version;
  const mode: EscrowMode = terms.mode;

  let source: string;
  let contractName: string;
  let constructorArgs: SilArtifactValue[];
  let effectiveNonce: string | undefined;

  if (version === "v1") {
    source = ESCROW_V1_SOURCE;
    contractName = ESCROW_V1_CONTRACT_NAME;
    constructorArgs = [
      pubkeyArg("buyer", config?.buyer?.publicKeyHex),
      pubkeyArg("seller", config?.seller?.publicKeyHex),
      pubkeyArg("arbiter", config?.arbiter?.publicKeyHex),
      destinationArg("buyerDestinationSpk", config?.buyerDestinationSpk),
      destinationArg("sellerDestinationSpk", config?.sellerDestinationSpk),
      amountArg("refundAmount", terms.refundAmount),
      amountArg("releaseAmount", terms.releaseAmount)
    ];
  } else if (mode === "split") {
    source = ESCROW_SPLIT_SOURCE;
    contractName = ESCROW_SPLIT_CONTRACT_NAME;
    const { arg, hex } = nonceArg(config.escrowNonce);
    effectiveNonce = hex;
    constructorArgs = [
      pubkeyArg("buyer", config?.buyer?.publicKeyHex),
      pubkeyArg("seller", config?.seller?.publicKeyHex),
      pubkeyArg("arbiter", config?.arbiter?.publicKeyHex),
      destinationArg("buyerDestinationSpk", config?.buyerDestinationSpk),
      destinationArg("sellerDestinationSpk", config?.sellerDestinationSpk),
      amountArg("buyerAmount", terms.buyerAmount),
      amountArg("sellerAmount", terms.sellerAmount),
      arg
    ];
  } else {
    source = ESCROW_FULL_SOURCE;
    contractName = ESCROW_CONTRACT_NAME;
    const { arg, hex } = nonceArg(config.escrowNonce);
    effectiveNonce = hex;
    const principal = terms.principal;
    constructorArgs = [
      pubkeyArg("buyer", config?.buyer?.publicKeyHex),
      pubkeyArg("seller", config?.seller?.publicKeyHex),
      pubkeyArg("arbiter", config?.arbiter?.publicKeyHex),
      destinationArg("buyerDestinationSpk", config?.buyerDestinationSpk),
      destinationArg("sellerDestinationSpk", config?.sellerDestinationSpk),
      amountArg("principal", principal),
      arg
    ];
  }

  let compiled: Awaited<ReturnType<typeof compileSilverScript>>;
  try {
    compiled = await compileSilverScript({ source, constructorArgs, home: options.home });
  } catch (e: any) {
    const code = String(e?.code ?? "");
    if (code.startsWith("SILVERC_TOOLCHAIN") || code === "SILVERC_PLATFORM_UNSUPPORTED") {
      throw new EscrowError("ESCROW_SILVERC_UNAVAILABLE", e.message, e);
    }
    if (code === "SILVERC_COMPILE_FAILED") throw new EscrowError("ESCROW_SILVERC_FAILED", e.message, e);
    if (code.startsWith("SILVER_ARTIFACT")) throw new EscrowError("ESCROW_ARTIFACT_INVALID", e.message, e);
    throw e;
  }

  let contract;
  try {
    contract = getSilContract(compiled.artifact, contractName).contract;
  } catch (e: any) {
    throw new EscrowError("ESCROW_ARTIFACT_INVALID", e.message, e);
  }
  const redeemScriptHex = silContractBytecodeHex(contract);
  const lock = silverP2shLock(redeemScriptHex);
  const address = silverP2shAddress(redeemScriptHex, options.networkId ?? "simnet");

  const effectiveConfig: EscrowConfig = {
    ...config,
    version,
    mode,
    ...(effectiveNonce ? { escrowNonce: effectiveNonce } : {})
  };

  return {
    artifact: compiled.artifact,
    provenance: {
      ...compiled.provenance,
      contractName,
      lockingScriptHex: lock.script,
      contractVersion: version,
      ...(effectiveNonce ? { escrowNonce: effectiveNonce } : {})
    },
    state: { lockingScriptHex: lock.script, redeemScriptHex, address },
    compiled: { constructorArgs, artifactBytes: compiled.artifactBytes },
    effectiveConfig
  };
}
