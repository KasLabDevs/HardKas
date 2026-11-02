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

  const version: EscrowVersion = config.version ?? "v2";
  const mode: EscrowMode = config.mode ?? (config.buyerAmount !== undefined && config.sellerAmount !== undefined ? "split" : "full");

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
      amountArg("refundAmount", config?.refundAmount),
      amountArg("releaseAmount", config?.releaseAmount)
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
      amountArg("buyerAmount", config?.buyerAmount ?? config?.refundAmount),
      amountArg("sellerAmount", config?.sellerAmount ?? config?.releaseAmount),
      arg
    ];
  } else {
    source = ESCROW_FULL_SOURCE;
    contractName = ESCROW_CONTRACT_NAME;
    const { arg, hex } = nonceArg(config.escrowNonce);
    effectiveNonce = hex;
    const principal = config.principal !== undefined ? config.principal : (config.refundAmount !== undefined ? config.refundAmount : config.releaseAmount);
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
