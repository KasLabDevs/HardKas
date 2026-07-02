import { createHash } from "node:crypto";
import { createKaspaP2shBlake2bLock } from "@hardkas/core";

export const SILVER_SIMULATOR_FEE_SOMPI = 2000n;
export const SILVER_SIMULATOR_CREATED_AT = "1970-01-01T00:00:00.000Z";
export const SILVER_SIMULATOR_VERSION = "1.0.0-alpha";
export const CURRENT_HASH_VERSION = 4;

export type SilverSimulationStatus = "SIMULATED_ACCEPTED";

export type SilverSimulationErrorCode =
  | "SILVERSCRIPT_REDEEM_HASH_MISMATCH"
  | "SILVERSCRIPT_LOCKING_SCRIPT_MISMATCH"
  | "SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY"
  | "SILVERSCRIPT_ARGS_HASH_MISMATCH"
  | "SILVERSCRIPT_UTXO_ALREADY_SPENT"
  | "SILVERSCRIPT_NETWORK_UNSUPPORTED"
  | "SILVERSCRIPT_AMOUNT_TOO_SMALL"
  | "SILVERSCRIPT_DEPLOY_RECEIPT_NOT_FOUND"
  | "SILVERSCRIPT_SCHEMA_INVALID"
  | "SILVERSCRIPT_INVALID_HEX"
  | "SILVERSCRIPT_EXPECTED_OUTPUTS_REQUIRED"
  | "SILVERSCRIPT_SIGNATURE_SCRIPT_MISMATCH";

export class SilverSimulationError extends Error {
  readonly code: SilverSimulationErrorCode;

  constructor(code: SilverSimulationErrorCode, message: string) {
    super(message);
    this.name = "SilverSimulationError";
    this.code = code;
  }
}

export interface SilverDeployPlanArtifactLike {
  schema: "hardkas.silver.deployPlan";
  hardkasVersion?: string;
  version?: string;
  hashVersion?: number | string;
  networkId: string;
  mode?: string;
  createdAt?: string;
  contentHash?: string;
  compileArtifactHash: string;
  compiledScriptHash: string;
  redeemScriptHex: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  scriptPublicKeyVersion: number;
  amountSompi: string;
  deployerAddress: string;
}

export interface SilverArgArtifactLike {
  type: "hex";
  value: string;
}

export interface SilverSpendPlanArtifactLike {
  schema: "hardkas.silver.spendPlan";
  hardkasVersion?: string;
  version?: string;
  hashVersion?: number | string;
  networkId: string;
  mode?: string;
  createdAt?: string;
  contentHash?: string;
  deployArtifactHash: string;
  compileArtifactHash: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  contractUtxoRef: {
    transactionId: string;
    index: number;
  };
  args: SilverArgArtifactLike[];
  argsHash: string;
  signatureScriptHex: string;
  expectedOutputs: SilverExpectedOutput[];
}

export interface SilverExpectedOutput {
  address: string;
  amountSompi: string;
  scriptHash?: string;
}

export interface SilverSyntheticOutpoint {
  transactionId: string;
  index: number;
}

export interface SilverDeploySimulationReceipt {
  schema: "hardkas.silver.deploySimulation";
  hardkasVersion: string;
  version: "1.0.0-alpha";
  hashVersion: number;
  networkId: "simnet";
  mode: "simulated";
  createdAt: string;
  deployPlanHash: string;
  compileArtifactHash: string;
  compiledScriptHash: string;
  redeemScriptHex: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  scriptPublicKeyVersion: 0;
  simulatedDeployTxId: string;
  syntheticOutpoint: SilverSyntheticOutpoint;
  amountSompi: string;
  feeSompi: string;
  status: SilverSimulationStatus;
  lineage: {
    artifactId: string;
    lineageId: string;
    parentArtifactId: string;
    rootArtifactId: string;
    sequence: number;
  };
  contentHash: string;
  artifactId: string;
}

export interface SilverSpendSimulationReceipt {
  schema: "hardkas.silver.spendSimulation";
  hardkasVersion: string;
  version: "1.0.0-alpha";
  hashVersion: number;
  networkId: "simnet";
  mode: "simulated";
  createdAt: string;
  deploySimulationHash: string;
  spendPlanHash: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  signatureScriptHex: string;
  simulatedSpendTxId: string;
  spentOutpoint: SilverSyntheticOutpoint;
  expectedOutputs: SilverExpectedOutput[];
  feeSompi: string;
  status: SilverSimulationStatus;
  lineage: {
    artifactId: string;
    lineageId: string;
    parentArtifactId: string;
    rootArtifactId: string;
    sequence: number;
  };
  contentHash: string;
  artifactId: string;
}

export interface SilverSimulatedUtxo {
  outpoint: SilverSyntheticOutpoint;
  deploySimulationHash: string;
  deployPlanHash: string;
  redeemScriptHex: string;
  redeemScriptHash: string;
  lockingScriptHex: string;
  amountSompi: string;
  networkId: "simnet";
  spent: boolean;
  spentByTxId?: string;
}

export interface SilverSimulationState {
  schema: "hardkas.silver.simulationState.v1";
  version: "1.0.0-alpha";
  networkId: "simnet";
  mode: "simulated";
  deployReceipts: Record<string, SilverDeploySimulationReceipt>;
  utxos: Record<string, SilverSimulatedUtxo>;
  spentOutpoints: string[];
}

export interface SilverDeploySimulationResult {
  receipt: SilverDeploySimulationReceipt;
  state: SilverSimulationState;
}

export interface SilverSpendSimulationResult {
  receipt: SilverSpendSimulationReceipt;
  state: SilverSimulationState;
}

export interface SilverSimulationOptions {
  hardkasVersion?: string;
  createdAt?: string;
}

type SilverDeploySimulationDraft = Omit<
  SilverDeploySimulationReceipt,
  "contentHash" | "artifactId"
>;
type SilverSpendSimulationDraft = Omit<
  SilverSpendSimulationReceipt,
  "contentHash" | "artifactId"
>;

export function createSilverSimulationState(): SilverSimulationState {
  return {
    schema: "hardkas.silver.simulationState.v1",
    version: SILVER_SIMULATOR_VERSION as "1.0.0-alpha",
    networkId: "simnet",
    mode: "simulated",
    deployReceipts: {},
    utxos: {},
    spentOutpoints: []
  };
}

export function simulateSilverDeploy(
  deployPlanArtifact: SilverDeployPlanArtifactLike,
  options: SilverSimulationOptions = {}
): SilverDeploySimulationResult {
  if (deployPlanArtifact.schema !== "hardkas.silver.deployPlan") {
    throw new SilverSimulationError(
      "SILVERSCRIPT_SCHEMA_INVALID",
      "Expected hardkas.silver.deployPlan."
    );
  }
  assertSimnet(deployPlanArtifact.networkId);
  assertHex(deployPlanArtifact.redeemScriptHex, "redeemScriptHex");

  const amountSompi = parseSompi(deployPlanArtifact.amountSompi);
  if (amountSompi <= SILVER_SIMULATOR_FEE_SOMPI) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_AMOUNT_TOO_SMALL",
      "Deploy amount must be greater than the simulator fee."
    );
  }

  const lock = createKaspaP2shBlake2bLock(deployPlanArtifact.redeemScriptHex);
  if (lock.redeemScriptHash !== deployPlanArtifact.redeemScriptHash) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_REDEEM_HASH_MISMATCH",
      "redeemScriptHash must equal blake2b32(raw redeem script bytes)."
    );
  }
  if (lock.lockingScriptHex !== deployPlanArtifact.lockingScriptHex) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_LOCKING_SCRIPT_MISMATCH",
      "lockingScriptHex must equal aa20 + redeemScriptHash + 87."
    );
  }
  if (deployPlanArtifact.scriptPublicKeyVersion !== 0) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_LOCKING_SCRIPT_MISMATCH",
      "scriptPublicKeyVersion must be 0 for this local simulator."
    );
  }

  const deployPlanHash = artifactHash(deployPlanArtifact);
  const simulatedDeployTxId = deterministicHex({
    kind: "hardkas.silver.simulatedDeployTx",
    deployPlanHash,
    redeemScriptHash: deployPlanArtifact.redeemScriptHash,
    amountSompi: deployPlanArtifact.amountSompi
  });
  const syntheticOutpoint = {
    transactionId: simulatedDeployTxId,
    index: 0
  };

  const draft = {
    schema: "hardkas.silver.deploySimulation" as const,
    hardkasVersion:
      options.hardkasVersion ?? deployPlanArtifact.hardkasVersion ?? "0.11.2-alpha",
    version: SILVER_SIMULATOR_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet" as const,
    mode: "simulated" as const,
    createdAt: options.createdAt ?? SILVER_SIMULATOR_CREATED_AT,
    deployPlanHash,
    compileArtifactHash: deployPlanArtifact.compileArtifactHash,
    compiledScriptHash: deployPlanArtifact.compiledScriptHash,
    redeemScriptHex: deployPlanArtifact.redeemScriptHex,
    redeemScriptHash: deployPlanArtifact.redeemScriptHash,
    lockingScriptHex: deployPlanArtifact.lockingScriptHex,
    scriptPublicKeyVersion: 0 as const,
    simulatedDeployTxId,
    syntheticOutpoint,
    amountSompi: amountSompi.toString(),
    feeSompi: SILVER_SIMULATOR_FEE_SOMPI.toString(),
    status: "SIMULATED_ACCEPTED" as const,
    lineage: {
      artifactId: `deploy-sim-${deployPlanHash.slice(0, 16)}`,
      lineageId: `silver-lineage-${deployPlanHash.slice(0, 16)}`,
      parentArtifactId: deployPlanHash,
      rootArtifactId: deployPlanHash,
      sequence: 1
    }
  } satisfies SilverDeploySimulationDraft;
  const receipt = finalizeArtifact(draft, "silverdeploysim");

  const state = createSilverSimulationState();
  state.deployReceipts[receipt.contentHash] = receipt;
  state.utxos[outpointKey(syntheticOutpoint)] = {
    outpoint: syntheticOutpoint,
    deploySimulationHash: receipt.contentHash,
    deployPlanHash,
    redeemScriptHex: deployPlanArtifact.redeemScriptHex,
    redeemScriptHash: deployPlanArtifact.redeemScriptHash,
    lockingScriptHex: deployPlanArtifact.lockingScriptHex,
    amountSompi: amountSompi.toString(),
    networkId: "simnet",
    spent: false
  };

  return {
    receipt,
    state: normalizeState(state)
  };
}

export function simulateSilverSpend(
  spendPlanArtifact: SilverSpendPlanArtifactLike,
  simulatedState: SilverSimulationState,
  options: SilverSimulationOptions = {}
): SilverSpendSimulationResult {
  if (spendPlanArtifact.schema !== "hardkas.silver.spendPlan") {
    throw new SilverSimulationError(
      "SILVERSCRIPT_SCHEMA_INVALID",
      "Expected hardkas.silver.spendPlan."
    );
  }
  assertSimnet(spendPlanArtifact.networkId);
  if (simulatedState.networkId !== "simnet") {
    throw new SilverSimulationError(
      "SILVERSCRIPT_NETWORK_UNSUPPORTED",
      "Silver/Toccata simulation state must be simnet."
    );
  }
  if (
    !Array.isArray(spendPlanArtifact.expectedOutputs) ||
    spendPlanArtifact.expectedOutputs.length === 0
  ) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_EXPECTED_OUTPUTS_REQUIRED",
      "Spend simulation requires explicit expectedOutputs."
    );
  }

  const key = outpointKey(spendPlanArtifact.contractUtxoRef);
  const utxo = simulatedState.utxos[key];
  const deployReceipt =
    simulatedState.deployReceipts[spendPlanArtifact.deployArtifactHash] ??
    Object.values(simulatedState.deployReceipts).find((receipt) => {
      return outpointKey(receipt.syntheticOutpoint) === key;
    });

  if (!utxo || !deployReceipt) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_DEPLOY_RECEIPT_NOT_FOUND",
      `No deploy simulation receipt exists for ${key}.`
    );
  }
  if (
    deployReceipt.networkId !== spendPlanArtifact.networkId ||
    utxo.networkId !== spendPlanArtifact.networkId
  ) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_NETWORK_UNSUPPORTED",
      "Spend plan network must match the deployed synthetic UTXO network."
    );
  }
  if (utxo.spent || simulatedState.spentOutpoints.includes(key)) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_UTXO_ALREADY_SPENT",
      `Synthetic UTXO ${key} has already been spent.`
    );
  }

  const pushes = parsePushOnlyScript(spendPlanArtifact.signatureScriptHex);
  const redeemScriptHex = pushes.at(-1);
  if (!redeemScriptHex) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY",
      "signatureScriptHex must end with a pushed redeem script."
    );
  }
  if (redeemScriptHex !== utxo.redeemScriptHex.toLowerCase()) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_SIGNATURE_SCRIPT_MISMATCH",
      "Redeem script must be the last push and match the deployed script."
    );
  }

  const lock = createKaspaP2shBlake2bLock(redeemScriptHex);
  if (lock.redeemScriptHash !== spendPlanArtifact.redeemScriptHash) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_REDEEM_HASH_MISMATCH",
      "Spend redeemScriptHash does not match pushed redeem script."
    );
  }
  if (lock.lockingScriptHex !== spendPlanArtifact.lockingScriptHex) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_LOCKING_SCRIPT_MISMATCH",
      "Spend lockingScriptHex does not match pushed redeem script."
    );
  }

  if (calculateSilverArgsHash(spendPlanArtifact.args) !== spendPlanArtifact.argsHash) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_ARGS_HASH_MISMATCH",
      "Spend argsHash does not match args."
    );
  }

  const argValues = spendPlanArtifact.args.map((arg) => {
    if (arg.type !== "hex" || !isHex(arg.value)) {
      throw new SilverSimulationError(
        "SILVERSCRIPT_INVALID_HEX",
        "Spend args must be hex push values."
      );
    }
    return arg.value.toLowerCase();
  });
  const pushedArgs = pushes.slice(0, -1);
  if (JSON.stringify(pushedArgs) !== JSON.stringify(argValues)) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_SIGNATURE_SCRIPT_MISMATCH",
      "signatureScriptHex args do not match spend plan args."
    );
  }

  const inputAmount = BigInt(utxo.amountSompi);
  const outputTotal = spendPlanArtifact.expectedOutputs.reduce((sum, output) => {
    return sum + parseSompi(output.amountSompi);
  }, 0n);
  if (outputTotal <= 0n || outputTotal + SILVER_SIMULATOR_FEE_SOMPI > inputAmount) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_AMOUNT_TOO_SMALL",
      "Synthetic UTXO amount must cover expectedOutputs plus simulator fee."
    );
  }

  const spendPlanHash = artifactHash(spendPlanArtifact);
  const simulatedSpendTxId = deterministicHex({
    kind: "hardkas.silver.simulatedSpendTx",
    spendPlanHash,
    deploySimulationHash: deployReceipt.contentHash,
    spentOutpoint: key,
    expectedOutputs: spendPlanArtifact.expectedOutputs
  });

  const draft = {
    schema: "hardkas.silver.spendSimulation" as const,
    hardkasVersion:
      options.hardkasVersion ?? spendPlanArtifact.hardkasVersion ?? "0.11.2-alpha",
    version: SILVER_SIMULATOR_VERSION as "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet" as const,
    mode: "simulated" as const,
    createdAt: options.createdAt ?? SILVER_SIMULATOR_CREATED_AT,
    deploySimulationHash: deployReceipt.contentHash,
    spendPlanHash,
    redeemScriptHash: spendPlanArtifact.redeemScriptHash,
    lockingScriptHex: spendPlanArtifact.lockingScriptHex,
    signatureScriptHex: spendPlanArtifact.signatureScriptHex,
    simulatedSpendTxId,
    spentOutpoint: spendPlanArtifact.contractUtxoRef,
    expectedOutputs: spendPlanArtifact.expectedOutputs,
    feeSompi: SILVER_SIMULATOR_FEE_SOMPI.toString(),
    status: "SIMULATED_ACCEPTED" as const,
    lineage: {
      artifactId: `spend-sim-${spendPlanHash.slice(0, 16)}`,
      lineageId: deployReceipt.lineage.lineageId,
      parentArtifactId: spendPlanHash,
      rootArtifactId: deployReceipt.lineage.rootArtifactId,
      sequence: 2
    }
  } satisfies SilverSpendSimulationDraft;
  const receipt = finalizeArtifact(draft, "silverspendsim");

  const nextState = cloneState(simulatedState);
  nextState.utxos[key] = {
    ...utxo,
    spent: true,
    spentByTxId: simulatedSpendTxId
  };
  nextState.spentOutpoints = Array.from(
    new Set([...nextState.spentOutpoints, key])
  ).sort();

  return {
    receipt,
    state: normalizeState(nextState)
  };
}

export function calculateSilverArgsHash(args: readonly SilverArgArtifactLike[]): string {
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

export function outpointKey(outpoint: SilverSyntheticOutpoint): string {
  return `${outpoint.transactionId}:${outpoint.index}`;
}

export function parsePushOnlyScript(signatureScriptHex: string): string[] {
  assertHex(signatureScriptHex, "signatureScriptHex");

  const pushes: string[] = [];
  let offset = 0;

  while (offset < signatureScriptHex.length) {
    const opcode = readByte(signatureScriptHex, offset);
    offset += 2;

    let byteCount: number;
    if (opcode === 0) {
      byteCount = 0;
    } else if (opcode >= 1 && opcode <= 75) {
      byteCount = opcode;
    } else if (opcode === 0x4c) {
      byteCount = readByte(signatureScriptHex, offset);
      offset += 2;
    } else if (opcode === 0x4d) {
      byteCount = readLittleEndian(signatureScriptHex, offset, 2);
      offset += 4;
    } else if (opcode === 0x4e) {
      byteCount = readLittleEndian(signatureScriptHex, offset, 4);
      offset += 8;
    } else {
      throw new SilverSimulationError(
        "SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY",
        `Non-push opcode 0x${opcode.toString(16)} encountered.`
      );
    }

    const hexCount = byteCount * 2;
    const end = offset + hexCount;
    if (end > signatureScriptHex.length) {
      throw new SilverSimulationError(
        "SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY",
        "Truncated pushdata in signatureScriptHex."
      );
    }
    pushes.push(signatureScriptHex.slice(offset, end).toLowerCase());
    offset = end;
  }

  return pushes;
}

function assertSimnet(networkId: string): void {
  if (networkId !== "simnet") {
    throw new SilverSimulationError(
      "SILVERSCRIPT_NETWORK_UNSUPPORTED",
      "Silver/Toccata simulator only supports local simnet."
    );
  }
}

function assertHex(value: string, field: string): void {
  if (!isHex(value)) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_INVALID_HEX",
      `${field} must be even-length hex.`
    );
  }
}

function isHex(value: string): boolean {
  return (
    typeof value === "string" && value.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(value)
  );
}

function calculateContentHash(value: unknown, _version = CURRENT_HASH_VERSION): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function canonicalStringify(value: unknown): string {
  if (typeof value === "bigint") {
    return JSON.stringify(`n:${value.toString()}`);
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }

  const exclusions = new Set([
    "contentHash",
    "artifactId",
    "hashVersion",
    "createdAt",
    "hardkasVersion",
    "status"
  ]);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => !exclusions.has(key) && record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

function parseSompi(value: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_AMOUNT_TOO_SMALL",
      "Sompi values must be unsigned integer strings."
    );
  }
  return BigInt(value);
}

function artifactHash(value: { contentHash?: string | undefined }): string {
  return value.contentHash ?? calculateContentHash(value, CURRENT_HASH_VERSION);
}

function deterministicHex(value: Record<string, unknown>): string {
  return calculateContentHash(value, CURRENT_HASH_VERSION);
}

function finalizeArtifact<T extends Record<string, unknown>>(
  artifact: T,
  prefix: string
): T & { contentHash: string; artifactId: string } {
  const contentHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
  return {
    ...artifact,
    contentHash,
    artifactId: `${prefix}-${contentHash.slice(0, 16)}`
  };
}

function cloneState(state: SilverSimulationState): SilverSimulationState {
  return JSON.parse(JSON.stringify(state)) as SilverSimulationState;
}

function normalizeState(state: SilverSimulationState): SilverSimulationState {
  return {
    ...state,
    deployReceipts: Object.fromEntries(
      Object.entries(state.deployReceipts).sort(([a], [b]) => a.localeCompare(b))
    ),
    utxos: Object.fromEntries(
      Object.entries(state.utxos).sort(([a], [b]) => a.localeCompare(b))
    ),
    spentOutpoints: [...state.spentOutpoints].sort()
  };
}

function readByte(hex: string, offset: number): number {
  const raw = hex.slice(offset, offset + 2);
  if (raw.length !== 2) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY",
      "Truncated opcode in signatureScriptHex."
    );
  }
  return parseInt(raw, 16);
}

function readLittleEndian(hex: string, offset: number, byteCount: number): number {
  const raw = hex.slice(offset, offset + byteCount * 2);
  if (raw.length !== byteCount * 2) {
    throw new SilverSimulationError(
      "SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY",
      "Truncated pushdata length in signatureScriptHex."
    );
  }
  const bytes = raw.match(/../g) ?? [];
  return parseInt(bytes.reverse().join(""), 16);
}
