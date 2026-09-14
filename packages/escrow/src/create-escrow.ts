import {
  compileSilverScript,
  getSilContract,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  type SilArtifactValue
} from "@hardkas/core";
import { ESCROW_CONTRACT_NAME, ESCROW_SOURCE } from "./escrow-source.js";
import type { EscrowArtifact, EscrowCompileProvenance, EscrowConfig, EscrowState } from "./types.js";

export { ESCROW_CONTRACT_NAME } from "./escrow-source.js";

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

export interface CreateEscrowOptions {
  /** Network the P2SH address is derived for (default simnet). */
  readonly networkId?: string | undefined;
  /** HARDKAS_HOME override for locating the managed silverc. */
  readonly home?: string | undefined;
}

/**
 * Compiles the escrow contract for these parties with the managed silverc
 * v1.0.0 and derives its P2SH lock from the SDK.
 *
 * Fails closed: an invalid configuration, a missing or unverified compiler, a
 * compiler error or an unexpected artifact is an error, never a substitute
 * script. The provenance records the constructor arguments by digest only.
 */
export async function createEscrow(
  config: EscrowConfig,
  options: CreateEscrowOptions = {}
): Promise<{
  state: EscrowState;
  artifact: EscrowArtifact;
  provenance: EscrowCompileProvenance;
  /** What was compiled, for reproduction: the arguments passed to silverc and its exact output. */
  compiled: { constructorArgs: readonly SilArtifactValue[]; artifactBytes: Uint8Array };
}> {
  const constructorArgs: SilArtifactValue[] = [
    pubkeyArg("buyer", config?.buyer?.publicKeyHex),
    pubkeyArg("seller", config?.seller?.publicKeyHex),
    pubkeyArg("arbiter", config?.arbiter?.publicKeyHex),
    destinationArg("buyerDestinationSpk", config?.buyerDestinationSpk),
    destinationArg("sellerDestinationSpk", config?.sellerDestinationSpk),
    amountArg("refundAmount", config?.refundAmount),
    amountArg("releaseAmount", config?.releaseAmount)
  ];

  let compiled: Awaited<ReturnType<typeof compileSilverScript>>;
  try {
    compiled = await compileSilverScript({ source: ESCROW_SOURCE, constructorArgs, home: options.home });
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
    contract = getSilContract(compiled.artifact, ESCROW_CONTRACT_NAME).contract;
  } catch (e: any) {
    throw new EscrowError("ESCROW_ARTIFACT_INVALID", e.message, e);
  }
  const redeemScriptHex = silContractBytecodeHex(contract);
  const lock = silverP2shLock(redeemScriptHex);
  const address = silverP2shAddress(redeemScriptHex, options.networkId ?? "simnet");

  return {
    artifact: compiled.artifact,
    provenance: { ...compiled.provenance, contractName: ESCROW_CONTRACT_NAME, lockingScriptHex: lock.script },
    state: { lockingScriptHex: lock.script, redeemScriptHex, address },
    compiled: { constructorArgs, artifactBytes: compiled.artifactBytes }
  };
}
