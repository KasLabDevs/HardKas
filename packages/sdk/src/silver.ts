import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { calculateContentHash, HARDKAS_VERSION, writeArtifact } from "@hardkas/artifacts";
import {
  createKaspaP2shBlake2bLock,
  createPushOnlySignatureScript,
  parseKasToSompi
} from "@hardkas/core";
import {
  createSilverSimulationState,
  simulateSilverDeploy,
  simulateSilverSpend,
  type SilverSimulationState
} from "@hardkas/simulator";
import type { Hardkas } from "./index.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface SilverSdkWriteOptions {
  write?: boolean;
  outputPath?: string;
}

export interface SilverCompileOptions extends SilverSdkWriteOptions {
  file: string;
  network?: "simnet" | string;
  compilerPath?: string;
}

export interface SilverDeployPlanOptions extends SilverSdkWriteOptions {
  artifact: string | any;
  from: string;
  amount?: string | number | bigint;
  network?: "simnet" | string;
}

export interface SilverSpendPlanOptions extends SilverSdkWriteOptions {
  receipt: string | any;
  args?: Array<{ type: "hex"; value: string }>;
  argsPath?: string;
  to: string;
}

export interface SilverCompareOptions {
  simulated: string | any;
  docker: string | any;
  mode?: SilverCompareMode;
}

export interface SilverSdkArtifactResult<T> {
  artifact: T;
  artifactPath?: string;
}

export type SilverCompareMode = "artifact-coherence" | "runtime-outcome" | "strict";

interface SilverCompareEntry {
  field: string;
  reason: string;
  classification:
    | "MATCH"
    | "MISSING_IN_SIM"
    | "MISSING_IN_REAL"
    | "SEMANTIC_MISMATCH"
    | "SEMANTICALLY_DERIVED"
    | "IGNORED_NON_CONSENSUS";
}

export interface SilverCompareReport {
  status: "SILVERSCRIPT_SIMULATION_MATCH" | "SILVERSCRIPT_SIMULATION_DRIFT";
  mode: SilverCompareMode;
  drift: SilverCompareEntry[];
  notes: SilverCompareEntry[];
  expectedKnownLimitations: ["PARTIAL_VM_SIMULATION"];
}

export const SilverScript = {
  builder() {
    throw new Error(
      "SILVERSCRIPT_MAINNET_NOT_ENABLED: SilverScript builder is experimental and requires simnet capability checks in 0.9.6-alpha."
    );
  }
};

export class HardkasSilver {
  public readonly simulate = {
    deploy: (deployPlan: string | any, options: SilverSdkWriteOptions = {}) =>
      this.simulateDeploy(deployPlan, options),
    spend: (
      spendPlan: string | any,
      state: SilverSimulationState = this.loadSimulationState(),
      options: SilverSdkWriteOptions = {}
    ) => this.simulateSpend(spendPlan, state, options),
    compare: (options: SilverCompareOptions) => this.compare(options)
  };

  constructor(private sdk: Hardkas) {}

  async compile(options: SilverCompileOptions): Promise<SilverSdkArtifactResult<any>> {
    const network = options.network || "simnet";
    assertSimnet(network);

    const filePath = path.resolve(this.sdk.cwd, options.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`SILVERSCRIPT_SOURCE_NOT_FOUND: ${filePath}`);
    }

    const compilerPath = resolveCompilerPath(this.sdk.cwd, options.compilerPath);
    if (!isExecutableAvailable(compilerPath)) {
      throw new Error(
        "SILVERSCRIPT_COMPILER_UNAVAILABLE: pass compilerPath, set HARDKAS_SILVERC_PATH, or install .hardkas/bin/silverc."
      );
    }

    const sourceContent = fs.readFileSync(filePath, "utf8");
    const compilerOutput = execFileSync(compilerPath, [filePath, "-c"], {
      encoding: "utf8",
      stdio: "pipe"
    });
    const normalized = normalizeSilverCompilerOutput(compilerOutput);
    if (!normalized.scriptHex) {
      throw new Error(
        "SILVERSCRIPT_COMPILER_OUTPUT_INVALID: compiled script hex not found."
      );
    }

    const artifact: any = {
      schema: HardkasSchemas.SilverCompile,
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      hashVersion: 4,
      networkId: network,
      mode: "simulated",
      createdAt: new Date().toISOString(),
      sourcePath: filePath,
      sourceHash: createHash("sha256").update(sourceContent).digest("hex"),
      compilerName: "silverc",
      compilerVersion: "unknown",
      compilerCommand: `${compilerPath} "${filePath}" -c`,
      compiledScriptHex: normalized.scriptHex,
      compiledScriptHash:
        normalized.scriptHash ||
        createHash("sha256")
          .update(Buffer.from(normalized.scriptHex, "hex"))
          .digest("hex"),
      abi: normalized.abi,
      network,
      assumptions: ["toccata-v2", "mainnet-disabled"]
    };
    finalizeArtifact(artifact, "silver");
    return this.writeSdkArtifact(artifact, options);
  }

  async deployPlan(
    options: SilverDeployPlanOptions
  ): Promise<SilverSdkArtifactResult<any>> {
    const network = options.network || "simnet";
    assertSimnet(network);
    const compileArtifact = await this.resolveArtifact(
      options.artifact,
      HardkasSchemas.SilverCompile
    );
    const amountSompi = parseKasToSompi(String(options.amount ?? "1")).toString();
    const fromAccount = await this.sdk.accounts.resolve(options.from);
    const lock = createKaspaP2shBlake2bLock(compileArtifact.compiledScriptHex);

    const artifact: any = {
      schema: HardkasSchemas.SilverDeployPlan,
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      hashVersion: 4,
      networkId: network,
      mode: "simulated",
      createdAt: new Date().toISOString(),
      compileArtifactHash: compileArtifact.contentHash,
      compiledScriptHash: compileArtifact.compiledScriptHash,
      redeemScriptHex: lock.redeemScriptHex,
      redeemScriptHash: lock.redeemScriptHash,
      lockingScriptHex: lock.lockingScriptHex,
      scriptPublicKeyVersion: lock.scriptPublicKeyVersion,
      amountSompi,
      deployerAddress: fromAccount.address
    };
    finalizeArtifact(artifact, "silverdeployplan");
    return this.writeSdkArtifact(artifact, options);
  }

  async deploy(
    options: {
      artifact: string | any;
      mode?: "simulate" | "real";
    } & SilverSdkWriteOptions
  ): Promise<SilverSdkArtifactResult<any>> {
    if (options.mode === "real") {
      throw new Error(
        "SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED: use `hardkas silver deploy` for Docker/RPC execution in 0.9.6-alpha."
      );
    }
    return this.simulateDeploy(options.artifact, options);
  }

  async spendPlan(
    options: SilverSpendPlanOptions
  ): Promise<SilverSdkArtifactResult<any>> {
    const deployArtifact = await this.resolveArtifact(
      options.receipt,
      HardkasSchemas.SilverDeploy
    );
    assertSimnet(deployArtifact.networkId);
    const args = options.args ?? readArgsFile(this.sdk.cwd, options.argsPath);
    const lock = createKaspaP2shBlake2bLock(deployArtifact.redeemScriptHex);
    if (lock.lockingScriptHex !== deployArtifact.lockingScriptHex) {
      throw new Error("SILVERSCRIPT_LOCKING_SCRIPT_MISMATCH");
    }
    if (lock.redeemScriptHash !== deployArtifact.redeemScriptHash) {
      throw new Error("SILVERSCRIPT_REDEEM_HASH_MISMATCH");
    }

    const signatureScriptHex = createPushOnlySignatureScript(
      args.map((arg) => arg.value),
      lock.redeemScriptHex
    );
    const feeSompi = 200000n;
    const sendAmount = BigInt(deployArtifact.amountSompi) - feeSompi;
    if (sendAmount <= 0n) {
      throw new Error("SILVERSCRIPT_AMOUNT_TOO_SMALL");
    }

    const artifact: any = {
      schema: HardkasSchemas.SilverSpendPlan,
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      hashVersion: 4,
      networkId: deployArtifact.networkId,
      mode: "simulated",
      createdAt: new Date().toISOString(),
      deployArtifactHash: deployArtifact.contentHash,
      compileArtifactHash: deployArtifact.compileArtifactHash,
      redeemScriptHash: lock.redeemScriptHash,
      lockingScriptHex: lock.lockingScriptHex,
      contractUtxoRef: {
        transactionId: deployArtifact.deployTxId,
        index: deployArtifact.outputIndex
      },
      args,
      argsHash: calculateArgsHash(args),
      signatureScriptHex,
      expectedOutputs: [
        {
          address: options.to,
          amountSompi: sendAmount.toString()
        }
      ]
    };
    finalizeArtifact(artifact, "silverspendplan");
    return this.writeSdkArtifact(artifact, options);
  }

  async spend(
    options: {
      artifact: string | any;
      state?: SilverSimulationState;
      mode?: "simulate" | "real";
    } & SilverSdkWriteOptions
  ): Promise<SilverSdkArtifactResult<any>> {
    if (options.mode === "real") {
      throw new Error(
        "SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED: use `hardkas silver spend` for Docker/RPC execution in 0.9.6-alpha."
      );
    }
    return this.simulateSpend(
      options.artifact,
      options.state ?? this.loadSimulationState(),
      options
    );
  }

  async simulateDeploy(
    deployPlan: string | any,
    options: SilverSdkWriteOptions = {}
  ): Promise<SilverSdkArtifactResult<any>> {
    const artifact = await this.resolveArtifact(deployPlan, HardkasSchemas.SilverDeployPlan);
    const result = simulateSilverDeploy(artifact);
    this.saveSimulationState(mergeState(this.loadSimulationState(), result.state));
    return this.writeSdkArtifact(result.receipt, options);
  }

  async simulateSpend(
    spendPlan: string | any,
    state: SilverSimulationState = this.loadSimulationState(),
    options: SilverSdkWriteOptions = {}
  ): Promise<SilverSdkArtifactResult<any>> {
    const artifact = await this.resolveArtifact(spendPlan, HardkasSchemas.SilverSpendPlan);
    const result = simulateSilverSpend(artifact, state);
    this.saveSimulationState(result.state);
    return this.writeSdkArtifact(result.receipt, options);
  }

  async compare(options: SilverCompareOptions): Promise<SilverCompareReport> {
    const simulated = await this.resolveArtifact(options.simulated);
    const docker = await this.resolveArtifact(options.docker);
    const mode = normalizeCompareMode(options.mode || "artifact-coherence");
    const { drift, notes } = compareSilverReceipts(simulated, docker, mode);
    return {
      status:
        drift.length === 0
          ? "SILVERSCRIPT_SIMULATION_MATCH"
          : "SILVERSCRIPT_SIMULATION_DRIFT",
      mode,
      drift,
      notes,
      expectedKnownLimitations: ["PARTIAL_VM_SIMULATION"]
    };
  }

  private async resolveArtifact(
    target: string | any,
    expectedSchema?: string
  ): Promise<any> {
    const artifact =
      typeof target === "string" ? await this.sdk.artifacts.read(target) : target;
    if (expectedSchema && artifact.schema !== expectedSchema) {
      throw new Error(
        `SILVERSCRIPT_SCHEMA_INVALID: expected ${expectedSchema}, got ${artifact.schema}.`
      );
    }
    return artifact;
  }

  private async writeSdkArtifact<T extends Record<string, any>>(
    artifact: T,
    options: SilverSdkWriteOptions
  ): Promise<SilverSdkArtifactResult<T>> {
    if (options.write === false) return { artifact };
    const artifactPath = options.outputPath
      ? path.resolve(this.sdk.cwd, options.outputPath)
      : path.join(this.sdk.cwd, `${artifact.artifactId}.json`);
    await writeArtifact(artifactPath, artifact as any);
    this.sdk.artifacts.cacheArtifact(artifact);
    return { artifact, artifactPath };
  }

  private simulationStatePath(): string {
    return path.join(this.sdk.workspace.hardkasDir, "silver-simulator", "state.json");
  }

  private loadSimulationState(): SilverSimulationState {
    const statePath = this.simulationStatePath();
    if (!fs.existsSync(statePath)) return createSilverSimulationState();
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as SilverSimulationState;
  }

  private saveSimulationState(state: SilverSimulationState): void {
    const statePath = this.simulationStatePath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
}

function assertSimnet(network: string): void {
  if (network !== "simnet") {
    throw new Error(
      "SILVERSCRIPT_MAINNET_NOT_ENABLED: Only simnet is supported for SilverScript lifecycle."
    );
  }
}

function resolveCompilerPath(cwd: string, explicit?: string): string {
  return (
    explicit ||
    process.env.HARDKAS_SILVERC_PATH ||
    path.join(
      cwd,
      ".hardkas",
      "bin",
      process.platform === "win32" ? "silverc.exe" : "silverc"
    )
  );
}

function isExecutableAvailable(command: string): boolean {
  try {
    execFileSync(command, ["--help"], { stdio: "ignore" });
    return true;
  } catch {
    return fs.existsSync(command);
  }
}

function normalizeSilverCompilerOutput(rawOutput: string): {
  scriptHex?: string;
  scriptHash?: string;
  abi?: any;
} {
  const normalized: { scriptHex?: string; scriptHash?: string; abi?: any } = {};
  const hexMatch = rawOutput.match(/Compiled script:\s*([a-fA-F0-9]+)/i);
  if (hexMatch?.[1]) normalized.scriptHex = hexMatch[1];
  const hashMatch = rawOutput.match(/Script Hash:\s*([a-fA-F0-9]+)/i);
  if (hashMatch?.[1]) normalized.scriptHash = hashMatch[1];

  try {
    const parsed = JSON.parse(rawOutput);
    if (Array.isArray(parsed.script)) {
      normalized.scriptHex = Buffer.from(parsed.script).toString("hex");
    } else if (typeof parsed.scriptHex === "string") {
      normalized.scriptHex = parsed.scriptHex;
    }
    if (typeof parsed.scriptHash === "string") normalized.scriptHash = parsed.scriptHash;
    if (parsed.abi !== undefined) normalized.abi = parsed.abi;
  } catch {
    // Keep regex-derived output.
  }

  return normalized;
}

function readArgsFile(
  cwd: string,
  argsPath?: string
): Array<{ type: "hex"; value: string }> {
  if (!argsPath) return [];
  const parsed = JSON.parse(fs.readFileSync(path.resolve(cwd, argsPath), "utf8"));
  const args = parsed.args ?? parsed;
  if (!Array.isArray(args))
    throw new Error("SILVERSCRIPT_SPEND_PLAN_INVALID: args must be an array.");
  return args.map((arg) => {
    if (arg.type !== "hex" || typeof arg.value !== "string") {
      throw new Error(
        "SILVERSCRIPT_SPEND_PLAN_INVALID: args must be { type: 'hex', value }."
      );
    }
    return { type: "hex", value: arg.value };
  });
}

function calculateArgsHash(args: Array<{ type: "hex"; value: string }>): string {
  return createHash("sha256").update(JSON.stringify(args)).digest("hex");
}

function finalizeArtifact(artifact: Record<string, any>, prefix: string): void {
  artifact.contentHash = calculateContentHash(artifact);
  artifact.artifactId = `${prefix}-${artifact.contentHash.substring(0, 16)}`;
}

function mergeState(
  existing: SilverSimulationState,
  next: SilverSimulationState
): SilverSimulationState {
  return {
    ...next,
    deployReceipts: {
      ...existing.deployReceipts,
      ...next.deployReceipts
    },
    utxos: {
      ...existing.utxos,
      ...next.utxos
    },
    spentOutpoints: Array.from(
      new Set([...existing.spentOutpoints, ...next.spentOutpoints])
    ).sort()
  };
}

function normalizeCompareMode(mode: unknown): SilverCompareMode {
  if (mode === "artifact-coherence" || mode === "runtime-outcome" || mode === "strict")
    return mode;
  throw new Error(
    "SILVERSCRIPT_COMPARE_MODE_INVALID: Expected artifact-coherence, runtime-outcome, or strict."
  );
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function valuesMatch(field: string, simulated: unknown, docker: unknown): boolean {
  if (field === "status") {
    return (
      simulated === docker ||
      (simulated === "SIMULATED_ACCEPTED" &&
        (docker === "accepted" || docker === "submitted"))
    );
  }
  return stableJson(simulated) === stableJson(docker);
}

function compareSilverReceipts(simulated: any, docker: any, mode: SilverCompareMode) {
  const drift: SilverCompareEntry[] = [];
  const notes: SilverCompareEntry[] = [];
  const fields = [
    "redeemScriptHash",
    "lockingScriptHex",
    "signatureScriptHex",
    "expectedOutputs",
    "status"
  ];

  if (mode === "runtime-outcome" || mode === "strict")
    fields.push("networkId", "spentOutpoint");
  if (mode === "strict") fields.push("lineage", "txId", "simulatedSpendTxId");

  for (const field of fields) {
    const entry = compareField(field, simulated[field], docker[field]);
    if (entry.classification === "MATCH") continue;
    const nonConsensusRuntimeIds =
      mode === "runtime-outcome" &&
      (field === "spentOutpoint" || field === "txId" || field === "simulatedSpendTxId");
    if (nonConsensusRuntimeIds) {
      notes.push({
        ...entry,
        classification: "SEMANTICALLY_DERIVED",
        reason:
          "synthetic simulator runtime identifier differs from Docker-observed runtime identifier"
      });
      continue;
    }
    drift.push(entry);
  }

  if (mode !== "strict") {
    const lineageReport = compareLineageSemantics(simulated, docker, mode);
    drift.push(...lineageReport.drift);
    notes.push(...lineageReport.notes);
  }

  return { drift, notes };
}

function compareField(
  field: string,
  simulatedValue: unknown,
  dockerValue: unknown
): SilverCompareEntry {
  if (simulatedValue === undefined) {
    return {
      field,
      reason: "missing in simulated receipt",
      classification: "MISSING_IN_SIM"
    };
  }
  if (dockerValue === undefined) {
    return {
      field,
      reason: "missing in docker receipt",
      classification: "MISSING_IN_REAL"
    };
  }
  if (valuesMatch(field, simulatedValue, dockerValue)) {
    return { field, reason: "match", classification: "MATCH" };
  }
  return { field, reason: "semantic mismatch", classification: "SEMANTIC_MISMATCH" };
}

function compareLineageSemantics(simulated: any, docker: any, mode: SilverCompareMode) {
  const drift: SilverCompareEntry[] = [];
  const notes: SilverCompareEntry[] = [];
  if (!simulated.lineage) {
    drift.push({
      field: "lineage",
      reason: "missing in simulated receipt",
      classification: "MISSING_IN_SIM"
    });
    return { drift, notes };
  }
  if (!docker.lineage) {
    drift.push({
      field: "lineage",
      reason: "missing in docker receipt",
      classification: "MISSING_IN_REAL"
    });
    return { drift, notes };
  }

  for (const check of [
    [
      "lineage.redeemScriptHash",
      simulated.redeemScriptHash,
      docker.redeemScriptHash,
      "redeem script hash anchors artifact coherence"
    ],
    [
      "lineage.lockingScriptHex",
      simulated.lockingScriptHex,
      docker.lockingScriptHex,
      "locking script anchors artifact coherence"
    ],
    [
      "lineage.signatureScriptHex",
      simulated.signatureScriptHex,
      docker.signatureScriptHex,
      "unlock script anchors artifact coherence"
    ],
    [
      "lineage.expectedOutputs",
      simulated.expectedOutputs,
      docker.expectedOutputs,
      "expected outputs anchor artifact coherence"
    ],
    ["lineage.network", simulated.networkId, docker.networkId, "network must match"]
  ] as const) {
    const entry = compareField(check[0], check[1], check[2]);
    if (entry.classification !== "MATCH") drift.push({ ...entry, reason: check[3] });
  }

  notes.push({
    field: "lineage.blob",
    reason:
      mode === "artifact-coherence"
        ? "raw lineage IDs are domain-specific: simulator lineage is synthetic, Docker lineage is receipt artifact lineage"
        : "raw lineage IDs are compared by semantic anchors; VM/consensus lineage equivalence is not claimed",
    classification: "SEMANTICALLY_DERIVED"
  });
  if (simulated.simulatedSpendTxId || docker.txId) {
    notes.push({
      field: "lineage.runtime.txid",
      reason:
        "simulatedSpendTxId and Docker txId are intentionally different runtime identifiers",
      classification: "IGNORED_NON_CONSENSUS"
    });
  }
  return { drift, notes };
}
