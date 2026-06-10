import fs from "node:fs";
import path from "node:path";
import { calculateContentHash, verifyArtifactIntegritySync } from "@hardkas/artifacts";
import type { Hardkas } from "./index.js";

export type ProgrammabilityKind = "silver" | "zk" | "vprog" | "full-lab";

export interface ProgrammabilityClaims {
  artifactCoherence: "READY_MATCH";
  silverScriptBuilder: "SILVERSCRIPT_BUILDER_READY";
  zkCorpusSurface: "ZK_CORPUS_SURFACE_READY";
  zkLocalVerification: "READY_GROTH16_FIXTURE_COHERENCE";
  risc0InspectSurface: "RISC0_INSPECT_SURFACE_READY";
  vProgsInspectSurface: "VPROGS_INSPECT_SURFACE_READY";
  runtimeOutcome: "PARTIAL";
  vmConsensusEquivalence: "NOT_CLAIMED";
  zkOnchainVerification: "NOT_CLAIMED";
  vProgsRuntime: "NOT_CLAIMED";
  vProgsStableApi: "NOT_CLAIMED";
  mainnet: "BLOCKED_BY_POLICY";
}

export interface ProgrammabilityIssue {
  code: string;
  message: string;
  file?: string;
}

export interface ProgrammabilityCapabilitiesResult {
  ok: boolean;
  schema: "hardkas.programmability.capabilities.v1";
  status: "PROGRAMMABILITY_SURFACE_READY";
  surfaces: {
    silverScript: "SILVERSCRIPT_BUILDER_READY";
    zkCorpus: "ZK_CORPUS_SURFACE_READY";
    groth16FixtureCoherence: "READY_GROTH16_FIXTURE_COHERENCE";
    risc0Inspect: "RISC0_INSPECT_SURFACE_READY";
    vProgsInspect: "VPROGS_INSPECT_SURFACE_READY";
  };
  claims: ProgrammabilityClaims;
  nonClaims: string[];
}

export interface ProgrammabilityInspectResult {
  ok: boolean;
  schema: "hardkas.programmability.inspect.v1";
  status: "PROGRAMMABILITY_ARTIFACT_INSPECTED" | "PROGRAMMABILITY_ARTIFACT_INVALID";
  kind: Exclude<ProgrammabilityKind, "full-lab">;
  path: string;
  artifactSchema?: string;
  contentHash?: string;
  sourceStatus?: string;
  claims: ProgrammabilityClaims;
  issues: ProgrammabilityIssue[];
}

export interface ProgrammabilityVerifyResult {
  ok: boolean;
  schema: "hardkas.programmability.verify.v1";
  status: "PROGRAMMABILITY_VERIFY_PASS" | "PROGRAMMABILITY_VERIFY_FAIL" | "PROGRAMMABILITY_VERIFY_PARTIAL";
  kind: Exclude<ProgrammabilityKind, "full-lab">;
  path: string;
  sourceStatus?: string;
  claims: ProgrammabilityClaims;
  issues: ProgrammabilityIssue[];
}

export interface ProgrammabilityCorpusReport {
  ok: boolean;
  schema: "hardkas.programmability.corpusReport.v1";
  path: string;
  status: "PROGRAMMABILITY_CORPUS_PASS" | "PROGRAMMABILITY_CORPUS_FAIL";
  summary: {
    silver: "PASS" | "FAIL" | "SKIPPED";
    zk: "PASS" | "FAIL" | "SKIPPED";
    vprogs: "PASS" | "FAIL" | "SKIPPED";
    rootManifest: "PASS" | "FAIL";
    knownLimitations: string[];
  };
  claims: ProgrammabilityClaims;
  issues: ProgrammabilityIssue[];
}

export interface ProgrammabilityAppPlan {
  ok: boolean;
  schema: "hardkas.programmability.appPlan.v1";
  status: "PROGRAMMABILITY_APP_PLAN_READY";
  kind: ProgrammabilityKind;
  template: string;
  commands: string[];
  sdkSurfaces: string[];
  claims: ProgrammabilityClaims;
  nonClaims: string[];
}

export class HardkasProgrammability {
  public readonly corpus: {
    verify: (options?: { path?: string; include?: Array<"silver" | "zk" | "vprogs"> }) => Promise<ProgrammabilityCorpusReport>;
  };
  public readonly app: {
    plan: (options?: { kind?: ProgrammabilityKind; template?: string }) => ProgrammabilityAppPlan;
  };

  constructor(private sdk: Hardkas) {
    this.corpus = {
      verify: (options = {}) => this.verifyCorpus(options)
    };
    this.app = {
      plan: (options = {}) => this.planApp(options)
    };
  }

  async capabilities(): Promise<ProgrammabilityCapabilitiesResult> {
    return createProgrammabilityCapabilities();
  }

  async inspect(options: {
    kind: Exclude<ProgrammabilityKind, "full-lab">;
    path: string;
  }): Promise<ProgrammabilityInspectResult> {
    if (options.kind === "zk") {
      const result = await this.sdk.zk.proof.inspect(options.path);
      return {
        ok: result.ok,
        schema: "hardkas.programmability.inspect.v1",
        status: result.ok ? "PROGRAMMABILITY_ARTIFACT_INSPECTED" : "PROGRAMMABILITY_ARTIFACT_INVALID",
        kind: "zk",
        path: result.path,
        sourceStatus: result.status,
        claims: programmabilityClaims(),
        issues: result.issues
      };
    }

    if (options.kind === "vprog") {
      const result = await this.sdk.vprogs.inspect(options.path);
      return {
        ok: result.ok,
        schema: "hardkas.programmability.inspect.v1",
        status: result.ok ? "PROGRAMMABILITY_ARTIFACT_INSPECTED" : "PROGRAMMABILITY_ARTIFACT_INVALID",
        kind: "vprog",
        path: result.path,
        ...(result.artifactSchema ? { artifactSchema: result.artifactSchema } : {}),
        ...(result.artifactHash ? { contentHash: result.artifactHash } : {}),
        sourceStatus: result.status,
        claims: programmabilityClaims(),
        issues: result.issues
      };
    }

    return inspectJsonArtifact(this.sdk.cwd, options.path, "silver");
  }

  async verify(options: {
    kind: Exclude<ProgrammabilityKind, "full-lab">;
    path: string;
  }): Promise<ProgrammabilityVerifyResult> {
    if (options.kind === "zk") {
      const result = await this.sdk.zk.proof.verifyLocal(options.path);
      return {
        ok: result.ok,
        schema: "hardkas.programmability.verify.v1",
        status: result.ok ? "PROGRAMMABILITY_VERIFY_PASS" : "PROGRAMMABILITY_VERIFY_PARTIAL",
        kind: "zk",
        path: result.path,
        sourceStatus: result.status,
        claims: programmabilityClaims(),
        issues: result.issues
      };
    }

    if (options.kind === "vprog") {
      const inspected = await this.sdk.vprogs.inspect(options.path);
      return {
        ok: inspected.ok,
        schema: "hardkas.programmability.verify.v1",
        status: inspected.ok ? "PROGRAMMABILITY_VERIFY_PASS" : "PROGRAMMABILITY_VERIFY_FAIL",
        kind: "vprog",
        path: inspected.path,
        sourceStatus: inspected.status,
        claims: programmabilityClaims(),
        issues: inspected.issues
      };
    }

    const resolved = path.resolve(this.sdk.cwd, options.path);
    const result = verifyArtifactIntegritySync(resolved, { strict: false });
    return {
      ok: result.ok,
      schema: "hardkas.programmability.verify.v1",
      status: result.ok ? "PROGRAMMABILITY_VERIFY_PASS" : "PROGRAMMABILITY_VERIFY_FAIL",
      kind: "silver",
      path: path.relative(this.sdk.cwd, resolved).replace(/\\/g, "/"),
      sourceStatus: result.ok ? "ARTIFACT_INTEGRITY_PASS" : "ARTIFACT_INTEGRITY_FAIL",
      claims: programmabilityClaims(),
      issues: result.issues.map((issue) => ({
        code: String(issue.code),
        message: issue.message,
        ...(issue.path ? { file: issue.path } : {})
      }))
    };
  }

  private async verifyCorpus(options: {
    path?: string;
    include?: Array<"silver" | "zk" | "vprogs">;
  }): Promise<ProgrammabilityCorpusReport> {
    const root = path.resolve(this.sdk.cwd, options.path ?? "fixtures/toccata-v2");
    const include = new Set(options.include ?? ["silver", "zk", "vprogs"]);
    const issues: ProgrammabilityIssue[] = [];
    const manifestPath = path.join(root, "manifest.json");
    const manifest = readJson(manifestPath, issues);

    if (manifest) {
      expectEqual(manifest.schema, "hardkas.toccataProgrammabilityCorpus.v1", issues, "PROGRAMMABILITY_CORPUS_SCHEMA_INVALID", manifestPath);
      expectEqual(manifest.network, "simnet", issues, "PROGRAMMABILITY_CORPUS_NETWORK_INVALID", manifestPath);
      expectEqual(manifest.profile, "toccata-v2", issues, "PROGRAMMABILITY_CORPUS_PROFILE_INVALID", manifestPath);
      expectEqual(manifest.claims?.artifactCoherence, "READY_MATCH", issues, "PROGRAMMABILITY_CLAIM_INVALID", manifestPath);
      expectEqual(manifest.claims?.runtimeOutcome, "PARTIAL", issues, "PROGRAMMABILITY_CLAIM_INVALID", manifestPath);
      expectEqual(manifest.claims?.vmConsensusEquivalence, "NOT_CLAIMED", issues, "PROGRAMMABILITY_CLAIM_INVALID", manifestPath);
      expectEqual(manifest.claims?.mainnet, "BLOCKED_BY_POLICY", issues, "PROGRAMMABILITY_CLAIM_INVALID", manifestPath);
      if (!Array.isArray(manifest.expectedKnownLimitations) || !manifest.expectedKnownLimitations.includes("PARTIAL_VM_SIMULATION")) {
        issues.push({
          code: "PROGRAMMABILITY_LIMITATION_NOT_DECLARED",
          message: "Root corpus must declare PARTIAL_VM_SIMULATION.",
          file: manifestPath
        });
      }
    }

    let silver: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
    let zk: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
    let vprogs: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";

    if (include.has("silver")) {
      const result = await this.sdk.corpus.verify(path.join(path.relative(this.sdk.cwd, root), "silver"));
      silver = result.ok ? "PASS" : "FAIL";
      issues.push(...result.issues);
    }
    if (include.has("zk")) {
      const result = await this.sdk.zk.corpus.verify(path.join(path.relative(this.sdk.cwd, root), "zk"));
      zk = result.ok ? "PASS" : "FAIL";
      issues.push(...result.issues);
    }
    if (include.has("vprogs")) {
      const artifact = manifest?.components?.vprogs?.artifact ?? "vprogs/inspect-only-artifact.json";
      const result = await this.sdk.vprogs.inspect(path.join(path.relative(this.sdk.cwd, root), artifact));
      vprogs = result.ok ? "PASS" : "FAIL";
      issues.push(...result.issues);
    }

    const ok = issues.length === 0;
    return {
      ok,
      schema: "hardkas.programmability.corpusReport.v1",
      path: path.relative(this.sdk.cwd, root).replace(/\\/g, "/"),
      status: ok ? "PROGRAMMABILITY_CORPUS_PASS" : "PROGRAMMABILITY_CORPUS_FAIL",
      summary: {
        silver,
        zk,
        vprogs,
        rootManifest: manifest ? "PASS" : "FAIL",
        knownLimitations: Array.isArray(manifest?.expectedKnownLimitations)
          ? manifest.expectedKnownLimitations
          : []
      },
      claims: programmabilityClaims(),
      issues
    };
  }

  private planApp(options: {
    kind?: ProgrammabilityKind;
    template?: string;
  }): ProgrammabilityAppPlan {
    const kind = options.kind ?? "full-lab";
    const template = options.template ?? defaultTemplate(kind);
    return {
      ok: true,
      schema: "hardkas.programmability.appPlan.v1",
      status: "PROGRAMMABILITY_APP_PLAN_READY",
      kind,
      template,
      commands: commandsForKind(kind),
      sdkSurfaces: sdkSurfacesForKind(kind),
      claims: programmabilityClaims(),
      nonClaims: nonClaims()
    };
  }
}

export function createProgrammabilityCapabilities(): ProgrammabilityCapabilitiesResult {
  return {
    ok: true,
    schema: "hardkas.programmability.capabilities.v1",
    status: "PROGRAMMABILITY_SURFACE_READY",
    surfaces: {
      silverScript: "SILVERSCRIPT_BUILDER_READY",
      zkCorpus: "ZK_CORPUS_SURFACE_READY",
      groth16FixtureCoherence: "READY_GROTH16_FIXTURE_COHERENCE",
      risc0Inspect: "RISC0_INSPECT_SURFACE_READY",
      vProgsInspect: "VPROGS_INSPECT_SURFACE_READY"
    },
    claims: programmabilityClaims(),
    nonClaims: nonClaims()
  };
}

export function programmabilityClaims(): ProgrammabilityClaims {
  return {
    artifactCoherence: "READY_MATCH",
    silverScriptBuilder: "SILVERSCRIPT_BUILDER_READY",
    zkCorpusSurface: "ZK_CORPUS_SURFACE_READY",
    zkLocalVerification: "READY_GROTH16_FIXTURE_COHERENCE",
    risc0InspectSurface: "RISC0_INSPECT_SURFACE_READY",
    vProgsInspectSurface: "VPROGS_INSPECT_SURFACE_READY",
    runtimeOutcome: "PARTIAL",
    vmConsensusEquivalence: "NOT_CLAIMED",
    zkOnchainVerification: "NOT_CLAIMED",
    vProgsRuntime: "NOT_CLAIMED",
    vProgsStableApi: "NOT_CLAIMED",
    mainnet: "BLOCKED_BY_POLICY"
  };
}

function inspectJsonArtifact(
  workspaceRoot: string,
  targetPath: string,
  kind: "silver"
): ProgrammabilityInspectResult {
  const resolved = path.resolve(workspaceRoot, targetPath);
  const issues: ProgrammabilityIssue[] = [];
  const artifact = readJson(resolved, issues);
  const ok = Boolean(artifact);
  return {
    ok,
    schema: "hardkas.programmability.inspect.v1",
    status: ok ? "PROGRAMMABILITY_ARTIFACT_INSPECTED" : "PROGRAMMABILITY_ARTIFACT_INVALID",
    kind,
    path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
    ...(artifact?.schema ? { artifactSchema: artifact.schema } : {}),
    ...(artifact ? { contentHash: calculateContentHash(artifact, artifact.hashVersion ?? 4) } : {}),
    claims: programmabilityClaims(),
    issues
  };
}

function readJson(filePath: string, issues: ProgrammabilityIssue[]): any | undefined {
  if (!fs.existsSync(filePath)) {
    issues.push({ code: "PROGRAMMABILITY_FILE_MISSING", message: `Missing ${filePath}.`, file: filePath });
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error: any) {
    issues.push({
      code: "PROGRAMMABILITY_JSON_INVALID",
      message: error?.message || `Invalid JSON in ${filePath}.`,
      file: filePath
    });
    return undefined;
  }
}

function expectEqual(
  actual: unknown,
  expected: unknown,
  issues: ProgrammabilityIssue[],
  code: string,
  file: string
) {
  if (actual !== expected) {
    issues.push({ code, message: `Expected ${String(expected)}, got ${String(actual)}.`, file });
  }
}

function defaultTemplate(kind: ProgrammabilityKind): string {
  if (kind === "silver") return "templates/programmability/silver-policy-app";
  if (kind === "zk") return "templates/programmability/zk-fixture-app";
  if (kind === "vprog") return "templates/programmability/vprogs-inspect-app";
  return "templates/programmability/full-lab-app";
}

function commandsForKind(kind: ProgrammabilityKind): string[] {
  const common = [
    "hardkas programmability capabilities --json",
    "hardkas programmability corpus verify fixtures/toccata-v2 --json"
  ];
  if (kind === "silver") return [...common, "hardkas silver inspect <artifact>"];
  if (kind === "zk") return [...common, "hardkas zk corpus verify fixtures/toccata-v2/zk --json"];
  if (kind === "vprog") return [...common, "hardkas vprogs inspect <artifact> --json"];
  return [
    ...common,
    "hardkas silver inspect <artifact>",
    "hardkas zk corpus verify fixtures/toccata-v2/zk --json",
    "hardkas vprogs inspect <artifact> --json"
  ];
}

function sdkSurfacesForKind(kind: ProgrammabilityKind): string[] {
  const common = ["hardkas.programmability.capabilities()", "hardkas.programmability.corpus.verify()"];
  if (kind === "silver") return [...common, "hardkas.silver.*"];
  if (kind === "zk") return [...common, "hardkas.zk.proof.*", "hardkas.zk.corpus.verify()"];
  if (kind === "vprog") return [...common, "hardkas.vprogs.inspect()"];
  return [...common, "hardkas.silver.*", "hardkas.zk.*", "hardkas.vprogs.*"];
}

function nonClaims(): string[] {
  return [
    "no mainnet",
    "no testnet claim",
    "no bridge",
    "no trustless exit",
    "no on-chain ZK verification",
    "no full vProgs runtime",
    "no VM/consensus equivalence"
  ];
}
