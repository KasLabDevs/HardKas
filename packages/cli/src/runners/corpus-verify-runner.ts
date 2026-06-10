import { getOutput } from "../output.js";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { calculateContentHash } from "@hardkas/artifacts";

export interface CorpusVerifyOptions {
  path: string;
  json?: boolean;
  workspaceRoot?: string;
}

interface CorpusIssue {
  code: string;
  message: string;
  file?: string;
}

interface CorpusVerifyResult {
  ok: boolean;
  schema: "hardkas.toccataCorpus.v1";
  path: string;
  summary: {
    happyPathFixtures: number;
    failureFixtures: number;
    artifactsChecked: number;
    contentHashes: "PASS" | "FAIL";
    compareMode: string;
    simulationStatus: string;
    knownLimitations: string[];
  };
  claims: {
    artifactCoherence: "READY_MATCH" | "INVALID";
    runtimeOutcome: "PARTIAL" | "INVALID";
    vmConsensusEquivalence: "NOT_CLAIMED" | "INVALID";
    mainnet: "BLOCKED_BY_POLICY" | "INVALID";
  };
  issues: CorpusIssue[];
}

const EXPECTED_LIMITATION = "PARTIAL_VM_SIMULATION";

export async function runCorpusVerify(
  options: CorpusVerifyOptions
): Promise<CorpusVerifyResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const corpusPath = path.resolve(workspaceRoot, options.path);
  const issues: CorpusIssue[] = [];

  const opTrueDir = path.join(corpusPath, "op-true");
  const failuresDir = path.join(corpusPath, "failures");
  const opManifestPath = path.join(opTrueDir, "manifest.json");
  const failureManifestPath = path.join(failuresDir, "manifest.json");

  const opManifest = readRequiredJson(opManifestPath, issues);
  const failureManifest = readRequiredJson(failureManifestPath, issues);

  if (opManifest) {
    expectEqual(
      opManifest.schema,
      "hardkas.toccataGoldenManifest.v1",
      issues,
      "OP_TRUE_SCHEMA_INVALID",
      opManifestPath
    );
    validateCommonClaims(opManifest, issues, opManifestPath);
  }

  if (failureManifest) {
    expectEqual(
      failureManifest.schema,
      "hardkas.toccataGoldenFailureManifest.v1",
      issues,
      "FAILURE_SCHEMA_INVALID",
      failureManifestPath
    );
    validateCommonClaims(failureManifest, issues, failureManifestPath);
  }

  let artifactsChecked = 0;
  if (opManifest?.files) {
    for (const file of opManifest.files) {
      const filePath = path.join(opTrueDir, file);
      if (!fs.existsSync(filePath)) {
        issues.push({
          code: "CORPUS_FILE_MISSING",
          message: `Missing referenced OP_TRUE file ${file}.`,
          file: filePath
        });
        continue;
      }
      if (file === "manifest.json" || file === "compare-report.json") continue;
      const artifact = readRequiredJson(filePath, issues);
      if (!artifact) continue;
      artifactsChecked += 1;
      verifyContentHash(artifact, issues, filePath);
    }
  }

  const comparePath = path.join(opTrueDir, "compare-report.json");
  const compareReport = readRequiredJson(comparePath, issues);
  if (compareReport) {
    expectEqual(
      compareReport.schema,
      "hardkas.toccataGoldenCompare.v1",
      issues,
      "COMPARE_SCHEMA_INVALID",
      comparePath
    );
    expectEqual(
      compareReport.compareMode,
      "artifact-coherence",
      issues,
      "COMPARE_MODE_INVALID",
      comparePath
    );
    expectEqual(
      compareReport.status,
      "SILVERSCRIPT_SIMULATION_MATCH",
      issues,
      "COMPARE_STATUS_INVALID",
      comparePath
    );
    if (!Array.isArray(compareReport.drift) || compareReport.drift.length !== 0) {
      issues.push({
        code: "COMPARE_DRIFT_NOT_EMPTY",
        message: "artifact-coherence compare report must not contain drift.",
        file: comparePath
      });
    }
    expectKnownLimitation(compareReport, issues, comparePath);
    const strictNotes = compareReport.semanticNotes || [];
    if (!Array.isArray(strictNotes) || strictNotes.length === 0) {
      issues.push({
        code: "STRICT_DRIFT_NOT_DECLARED",
        message: "Strict/runtime lineage differences must be declared as semantic notes.",
        file: comparePath
      });
    }
  }

  let failureFixtures = 0;
  if (failureManifest?.cases) {
    for (const entry of failureManifest.cases) {
      failureFixtures += 1;
      const filePath = path.join(failuresDir, entry.file);
      const fixture = readRequiredJson(filePath, issues);
      if (!fixture) continue;
      expectEqual(
        fixture.schema,
        "hardkas.toccataGoldenFailureCase.v1",
        issues,
        "FAILURE_CASE_SCHEMA_INVALID",
        filePath
      );
      if (!entry.expectedSimulatorError) {
        issues.push({
          code: "EXPECTED_SIMULATOR_ERROR_MISSING",
          message: `Failure case ${entry.caseId} must declare expectedSimulatorError.`,
          file: failureManifestPath
        });
      }
      const expectedError =
        fixture.expectedSimulator?.error ||
        fixture.expectedSimulator?.secondAttempt?.error;
      expectEqual(
        expectedError,
        entry.expectedSimulatorError,
        issues,
        "EXPECTED_SIMULATOR_ERROR_MISMATCH",
        filePath
      );
      validateFailureReferences(fixture, issues, filePath, corpusPath);

      if (entry.caseId === "mainnet-guard") {
        validateMainnetGuard(entry, fixture, issues, filePath);
      }
    }
  }

  const ok = issues.length === 0;
  const result: CorpusVerifyResult = {
    ok,
    schema: "hardkas.toccataCorpus.v1",
    path: path.relative(workspaceRoot, corpusPath).replace(/\\/g, "/"),
    summary: {
      happyPathFixtures: opManifest ? 1 : 0,
      failureFixtures,
      artifactsChecked,
      contentHashes: issues.some((issue) => issue.code.includes("HASH"))
        ? "FAIL"
        : "PASS",
      compareMode: compareReport?.compareMode ?? "unknown",
      simulationStatus: compareReport?.status ?? "unknown",
      knownLimitations: collectKnownLimitations(
        opManifest,
        failureManifest,
        compareReport
      )
    },
    claims: {
      artifactCoherence: ok ? "READY_MATCH" : "INVALID",
      runtimeOutcome: ok ? "PARTIAL" : "INVALID",
      vmConsensusEquivalence: ok ? "NOT_CLAIMED" : "INVALID",
      mainnet: ok ? "BLOCKED_BY_POLICY" : "INVALID"
    },
    issues
  };

  if (options.json) {
    getOutput().writeLine(JSON.stringify(result, null, 2));
  } else if (ok) {
    getOutput().writeLine(pc.green("TOCCATA_GOLDEN_CORPUS_VERIFY_PASS"));
    getOutput().writeLine(`Path: ${result.path}`);
    getOutput().writeLine(`Artifacts checked: ${artifactsChecked}`);
    getOutput().writeLine(`Failure fixtures: ${failureFixtures}`);
    getOutput().writeLine(pc.dim(EXPECTED_LIMITATION));
  } else {
    getOutput().error(pc.red("TOCCATA_GOLDEN_CORPUS_VERIFY_FAIL"));
    for (const issue of issues) {
      getOutput().error(`- ${issue.code}: ${issue.message}`);
    }
  }

  if (!ok) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("CORPUS_VERIFY_FAILED", "Corpus verification failed.", {
      exitCode: 1
    });
  }
  return result;
}

function readRequiredJson(filePath: string, issues: CorpusIssue[]) {
  if (!fs.existsSync(filePath)) {
    issues.push({
      code: "FILE_MISSING",
      message: `Missing required file ${filePath}.`,
      file: filePath
    });
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error: any) {
    issues.push({
      code: "JSON_INVALID",
      message: error?.message || `Invalid JSON in ${filePath}.`,
      file: filePath
    });
    return undefined;
  }
}

function validateCommonClaims(manifest: any, issues: CorpusIssue[], filePath: string) {
  expectEqual(manifest.network, "simnet", issues, "NETWORK_INVALID", filePath);
  expectEqual(manifest.profile, "toccata-v2", issues, "PROFILE_INVALID", filePath);
  const claim = manifest.simulationClaim || manifest.simulationLevel;
  expectEqual(
    claim?.artifactCoherence,
    "READY",
    issues,
    "ARTIFACT_COHERENCE_CLAIM_INVALID",
    filePath
  );
  expectEqual(
    claim?.runtimeOutcome,
    "PARTIAL",
    issues,
    "RUNTIME_OUTCOME_CLAIM_INVALID",
    filePath
  );
  expectEqual(
    claim?.vmConsensusEquivalence,
    "NOT_CLAIMED",
    issues,
    "VM_CONSENSUS_CLAIM_INVALID",
    filePath
  );
  expectKnownLimitation(manifest, issues, filePath);
}

function expectKnownLimitation(value: any, issues: CorpusIssue[], filePath: string) {
  const limitations =
    value.expectedKnownLimitations || [value.expectedCompareStatus].filter(Boolean);
  if (!Array.isArray(limitations) || !limitations.includes(EXPECTED_LIMITATION)) {
    issues.push({
      code: "PARTIAL_VM_SIMULATION_NOT_DECLARED",
      message: "Expected known limitations must include PARTIAL_VM_SIMULATION.",
      file: filePath
    });
  }
}

function verifyContentHash(artifact: any, issues: CorpusIssue[], filePath: string) {
  if (typeof artifact.contentHash !== "string") {
    issues.push({
      code: "CONTENT_HASH_MISSING",
      message: "Artifact is missing contentHash.",
      file: filePath
    });
    return;
  }
  const actual = calculateContentHash(artifact, artifact.hashVersion ?? 4);
  if (actual !== artifact.contentHash) {
    issues.push({
      code: "CONTENT_HASH_MISMATCH",
      message: `Expected ${artifact.contentHash}, got ${actual}.`,
      file: filePath
    });
  }
}

function validateFailureReferences(
  fixture: any,
  issues: CorpusIssue[],
  filePath: string,
  corpusPath: string
) {
  for (const ref of collectFixtureRefs(fixture)) {
    const refPath = ref.split("#")[0];
    if (!refPath) {
      issues.push({
        code: "FAILURE_REFERENCE_INVALID",
        message: `Referenced fixture path is empty: ${ref}.`,
        file: filePath
      });
      continue;
    }
    const resolved = path.resolve(path.dirname(filePath), refPath);
    if (!resolved.startsWith(corpusPath) || !fs.existsSync(resolved)) {
      issues.push({
        code: "FAILURE_REFERENCE_INVALID",
        message: `Referenced fixture file does not exist or escapes corpus: ${ref}.`,
        file: filePath
      });
    }
  }
}

function collectFixtureRefs(fixture: any): string[] {
  const refs = [fixture.baseArtifact, fixture.requiredState].filter(Boolean);
  const setupRefs = fixture.stateSetup
    ? [fixture.stateSetup.deployPlan, fixture.stateSetup.deploySimulationReceipt]
    : [];
  const normalizationRefs = fixture.stateSetup?.simulatorSpendInputNormalization ?? [];
  for (const entry of normalizationRefs) {
    if (entry.valueFrom) refs.push(entry.valueFrom);
  }
  return [...refs, ...setupRefs].filter(Boolean);
}

function validateMainnetGuard(
  entry: any,
  fixture: any,
  issues: CorpusIssue[],
  filePath: string
) {
  const status = fixture.expectedReal?.status;
  const error = fixture.expectedReal?.error || entry.expectedRealError;
  if (status !== "BLOCKED_BY_POLICY" || error !== "SILVERSCRIPT_MAINNET_NOT_ENABLED") {
    issues.push({
      code: "MAINNET_GUARD_CLAIM_INVALID",
      message:
        "mainnet-guard must declare BLOCKED_BY_POLICY / SILVERSCRIPT_MAINNET_NOT_ENABLED.",
      file: filePath
    });
  }
}

function collectKnownLimitations(...values: any[]): string[] {
  return Array.from(
    new Set(
      values.flatMap((value) => {
        if (!value) return [];
        if (Array.isArray(value.expectedKnownLimitations))
          return value.expectedKnownLimitations;
        return [value.expectedCompareStatus].filter(Boolean);
      })
    )
  ).sort();
}

function expectEqual(
  actual: unknown,
  expected: unknown,
  issues: CorpusIssue[],
  code: string,
  file: string
) {
  if (actual !== expected) {
    issues.push({
      code,
      message: `Expected ${String(expected)}, got ${String(actual)}.`,
      file
    });
  }
}
