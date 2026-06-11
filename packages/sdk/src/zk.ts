import fs from "node:fs";
import path from "node:path";
import { calculateContentHash } from "@hardkas/artifacts";
import type { Hardkas } from "./index.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export type ZkProofSystem = "groth16" | "risc0" | "unknown";

export interface ZkIssue {
  code: string;
  message: string;
  file?: string;
}

export interface ZkCapabilities {
  schema: typeof HardkasSchemas.ZkCapabilitiesV1;
  experimental: true;
  proofSystems: {
    groth16: {
      inspect: true;
      verifyLocal: "FIXTURE_COHERENCE_ONLY";
      proofGeneration: "NOT_CLAIMED";
    };
    risc0: {
      inspect: true;
      verifyLocal: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED";
      proofGeneration: "NOT_CLAIMED";
    };
  };
  claims: {
    zkArtifactCoherence: "EXPERIMENTAL";
    zkLocalVerification: "EXPERIMENTAL_FIXTURE_ONLY";
    zkOnchainVerification: "NOT_CLAIMED";
    vmConsensusEquivalence: "NOT_CLAIMED";
    mainnet: "BLOCKED_BY_POLICY";
  };
  errors: string[];
}

export interface ZkProofInspectResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkProofInspectV1;
  path: string;
  proofSystem: ZkProofSystem;
  status: "ZK_PROOF_INSPECTED" | "ZK_PROOF_INSPECT_FAILED";
  experimental: true;
  summary: {
    files: string[];
    contentHashes: Record<string, string>;
    verifierAdapter?: string;
    expectedStatus?: string;
  };
  claims: ZkCapabilities["claims"];
  issues: ZkIssue[];
}

export interface ZkProofVerifyResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkProofVerificationV1;
  path: string;
  proofSystem: ZkProofSystem;
  status:
    | "ZK_FIXTURE_COHERENCE_PASS"
    | "ZK_FIXTURE_COHERENCE_FAIL"
    | "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"
    | "ZK_VERIFIER_UNSUPPORTED"
    | "ZK_VERIFIER_UNAVAILABLE";
  experimental: true;
  summary: {
    verifierAdapter?: string;
    contentHashes: "PASS" | "FAIL";
    localVerification: "PASS" | "FAIL" | "NOT_IMPLEMENTED";
  };
  claims: ZkCapabilities["claims"];
  issues: ZkIssue[];
}

export interface ZkCorpusVerifyResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkCorpusVerificationV1;
  path: string;
  experimental: true;
  status: "ZK_CORPUS_VERIFICATION_PASS" | "ZK_CORPUS_VERIFICATION_FAIL";
  summary: {
    proofSystems: string[];
    fixturesChecked: number;
    artifactsChecked: number;
    contentHashes: "PASS" | "FAIL";
    localVerification: "PASS" | "FAIL" | "PARTIAL";
    knownLimitations: string[];
  };
  claims: {
    zkArtifactCoherence: "READY_MATCH" | "INVALID";
    zkLocalVerification: "READY_GROTH16_FIXTURE_COHERENCE" | "INVALID";
    zkOnchainVerification: "NOT_CLAIMED" | "INVALID";
    runtimeOutcome: "PARTIAL" | "INVALID";
    vmConsensusEquivalence: "NOT_CLAIMED" | "INVALID";
    mainnet: "BLOCKED_BY_POLICY" | "INVALID";
  };
  issues: ZkIssue[];
}

const ZK_KNOWN_LIMITATIONS = [
  "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
  "PARTIAL_VM_SIMULATION"
];

export class HardkasZk {
  public readonly proof: {
    inspect: (targetPath: string) => Promise<ZkProofInspectResult>;
    verifyLocal: (targetPath: string) => Promise<ZkProofVerifyResult>;
  };
  public readonly corpus: {
    verify: (targetPath: string) => Promise<ZkCorpusVerifyResult>;
  };

  constructor(private sdk: Hardkas) {
    this.proof = {
      inspect: (targetPath: string) => inspectZkProof(targetPath, this.sdk.cwd),
      verifyLocal: (targetPath: string) => verifyZkProofLocal(targetPath, this.sdk.cwd)
    };
    this.corpus = {
      verify: (targetPath: string) => verifyZkCorpus(targetPath, this.sdk.cwd)
    };
  }

  async capabilities(): Promise<ZkCapabilities> {
    return createZkCapabilities();
  }
}

export function createZkCapabilities(): ZkCapabilities {
  return {
    schema: HardkasSchemas.ZkCapabilitiesV1,
    experimental: true,
    proofSystems: {
      groth16: {
        inspect: true,
        verifyLocal: "FIXTURE_COHERENCE_ONLY",
        proofGeneration: "NOT_CLAIMED"
      },
      risc0: {
        inspect: true,
        verifyLocal: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
        proofGeneration: "NOT_CLAIMED"
      }
    },
    claims: zkClaims(),
    errors: [
      "SDK_ZK_ONCHAIN_VERIFICATION_UNSUPPORTED",
      "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
      "ZK_VERIFIER_UNSUPPORTED",
      "ZK_VERIFIER_UNAVAILABLE",
      "ZK_CORPUS_MANIFEST_INVALID",
      "ZK_CORPUS_HASH_MISMATCH",
      "RISC0_VERIFIER_UNAVAILABLE",
      "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"
    ]
  };
}

export async function inspectZkProof(
  targetPath: string,
  workspaceRoot = process.cwd()
): Promise<ZkProofInspectResult> {
  const resolved = path.resolve(workspaceRoot, targetPath);
  const issues: ZkIssue[] = [];
  const manifestPath = resolveManifestPath(resolved, issues);
  const manifest = manifestPath ? readJson(manifestPath, issues) : undefined;
  const dir = manifestPath ? path.dirname(manifestPath) : path.dirname(resolved);
  const proofSystem = detectProofSystem(manifest, resolved);
  const fixtureFiles = collectFixtureFiles(manifest);
  const files = fixtureFiles.map((entry) => entry.file);
  const contentHashes: Record<string, string> = {};

  for (const { key, file } of fixtureFiles) {
    const filePath = path.join(dir, file);
    const value = readJson(filePath, issues);
    if (!value) continue;
    const actual = calculateContentHash(value);
    contentHashes[file] = actual;
    const expected = manifest?.contentHashes?.[key];
    if (typeof expected === "string" && expected !== actual) {
      issues.push({
        code: "ZK_CORPUS_HASH_MISMATCH",
        message: `Expected ${expected}, got ${actual}.`,
        file: filePath
      });
    }
  }

  const ok = issues.length === 0 && proofSystem !== "unknown";
  if (proofSystem === "unknown") {
    issues.push({
      code: "ZK_VERIFIER_UNSUPPORTED",
      message: "Could not determine proof system from artifact or manifest.",
      file: resolved
    });
  }

  return {
    ok,
    schema: HardkasSchemas.ZkProofInspectV1,
    path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
    proofSystem,
    status: ok ? "ZK_PROOF_INSPECTED" : "ZK_PROOF_INSPECT_FAILED",
    experimental: true,
    summary: {
      files,
      contentHashes,
      verifierAdapter: manifest?.verifierAdapter,
      expectedStatus: manifest?.expectedStatus
    },
    claims: zkClaims(),
    issues
  };
}

export async function verifyZkProofLocal(
  targetPath: string,
  workspaceRoot = process.cwd()
): Promise<ZkProofVerifyResult> {
  const resolved = path.resolve(workspaceRoot, targetPath);
  const issues: ZkIssue[] = [];
  const manifestPath = resolveManifestPath(resolved, issues);
  const manifest = manifestPath ? readJson(manifestPath, issues) : undefined;
  const dir = manifestPath ? path.dirname(manifestPath) : path.dirname(resolved);
  const proofSystem = detectProofSystem(manifest, resolved);

  if (proofSystem === "risc0") {
    return {
      ok: false,
      schema: HardkasSchemas.ZkProofVerificationV1,
      path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
      proofSystem,
      status: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
      experimental: true,
      summary: {
        verifierAdapter: manifest?.verifierAdapter ?? "risc0-helper",
        contentHashes: "PASS",
        localVerification: "NOT_IMPLEMENTED"
      },
      claims: zkClaims(),
      issues: [
        {
          code: "RISC0_VERIFIER_UNAVAILABLE",
          message:
            "RISC0 local receipt verification helper is not bundled in 0.9.4-alpha."
        },
        {
          code: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
          message: "RISC0 is inspect-only in this experimental lab scaffold."
        }
      ]
    };
  }

  if (proofSystem !== "groth16") {
    return unsupportedVerification(
      resolved,
      workspaceRoot,
      proofSystem,
      issues,
      manifest?.verifierAdapter
    );
  }

  verifyGroth16Fixture(dir, manifest, issues);
  const ok = issues.length === 0;
  return {
    ok,
    schema: HardkasSchemas.ZkProofVerificationV1,
    path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
    proofSystem,
    status: ok ? "ZK_FIXTURE_COHERENCE_PASS" : "ZK_FIXTURE_COHERENCE_FAIL",
    experimental: true,
    summary: {
      verifierAdapter:
        manifest?.verifierAdapter ?? "hardkas-groth16-fixture-coherence-v1",
      contentHashes: issues.some((issue) => issue.code.includes("HASH"))
        ? "FAIL"
        : "PASS",
      localVerification: ok ? "PASS" : "FAIL"
    },
    claims: zkClaims(),
    issues
  };
}

export async function verifyZkCorpus(
  targetPath: string,
  workspaceRoot = process.cwd()
): Promise<ZkCorpusVerifyResult> {
  const corpusPath = path.resolve(workspaceRoot, targetPath);
  const issues: ZkIssue[] = [];
  const manifestPath = path.join(corpusPath, "manifest.json");
  const manifest = readJson(manifestPath, issues);

  if (manifest) {
    expectEqual(
      manifest.schema,
      HardkasSchemas.ZkCorpusV1,
      issues,
      "ZK_CORPUS_MANIFEST_INVALID",
      manifestPath
    );
    expectEqual(
      manifest.network,
      "simnet",
      issues,
      "ZK_NETWORK_UNSUPPORTED",
      manifestPath
    );
    expectEqual(
      manifest.profile,
      "toccata-v2",
      issues,
      "ZK_PROFILE_UNSUPPORTED",
      manifestPath
    );
    expectEqual(
      manifest.claims?.zkOnchainVerification,
      "NOT_CLAIMED",
      issues,
      "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
      manifestPath
    );
    expectEqual(
      manifest.claims?.vmConsensusEquivalence,
      "NOT_CLAIMED",
      issues,
      "ZK_VM_CONSENSUS_CLAIM_INVALID",
      manifestPath
    );
    expectEqual(
      manifest.claims?.mainnet,
      "BLOCKED_BY_POLICY",
      issues,
      "ZK_MAINNET_GUARD_INVALID",
      manifestPath
    );
    for (const limitation of ZK_KNOWN_LIMITATIONS) {
      if (
        !Array.isArray(manifest.expectedKnownLimitations) ||
        !manifest.expectedKnownLimitations.includes(limitation)
      ) {
        issues.push({
          code: "ZK_LIMITATION_NOT_DECLARED",
          message: `ZK corpus must declare ${limitation}.`,
          file: manifestPath
        });
      }
    }
  }

  let fixturesChecked = 0;
  let artifactsChecked = 0;
  const proofSystems = new Set<string>();

  if (Array.isArray(manifest?.fixtures)) {
    for (const fixture of manifest.fixtures) {
      fixturesChecked += 1;
      const fixturePath = path.join(corpusPath, fixture.path);
      const inspect = await inspectZkProof(fixturePath, workspaceRoot);
      artifactsChecked += inspect.summary.files.length;
      if (inspect.proofSystem !== "unknown") proofSystems.add(inspect.proofSystem);
      issues.push(...inspect.issues);

      if (inspect.proofSystem === "groth16") {
        const verified = await verifyZkProofLocal(fixturePath, workspaceRoot);
        issues.push(...verified.issues);
        expectEqual(
          verified.status,
          fixture.expectedStatus,
          issues,
          "ZK_FIXTURE_STATUS_MISMATCH",
          fixturePath
        );
      } else if (inspect.proofSystem === "risc0") {
        const verified = await verifyZkProofLocal(fixturePath, workspaceRoot);
        expectEqual(
          verified.status,
          fixture.expectedStatus,
          issues,
          "ZK_FIXTURE_STATUS_MISMATCH",
          fixturePath
        );
      }
    }
  } else if (manifest) {
    issues.push({
      code: "ZK_CORPUS_MANIFEST_INVALID",
      message: "ZK corpus manifest must include fixtures array.",
      file: manifestPath
    });
  }

  const ok = issues.length === 0;
  return {
    ok,
    schema: HardkasSchemas.ZkCorpusVerificationV1,
    path: path.relative(workspaceRoot, corpusPath).replace(/\\/g, "/"),
    experimental: true,
    status: ok ? "ZK_CORPUS_VERIFICATION_PASS" : "ZK_CORPUS_VERIFICATION_FAIL",
    summary: {
      proofSystems: Array.from(proofSystems).sort(),
      fixturesChecked,
      artifactsChecked,
      contentHashes: issues.some((issue) => issue.code.includes("HASH"))
        ? "FAIL"
        : "PASS",
      localVerification: ok ? "PARTIAL" : "FAIL",
      knownLimitations: Array.isArray(manifest?.expectedKnownLimitations)
        ? manifest.expectedKnownLimitations
        : []
    },
    claims: {
      zkArtifactCoherence: ok ? "READY_MATCH" : "INVALID",
      zkLocalVerification: ok ? "READY_GROTH16_FIXTURE_COHERENCE" : "INVALID",
      zkOnchainVerification: ok ? "NOT_CLAIMED" : "INVALID",
      runtimeOutcome: ok ? "PARTIAL" : "INVALID",
      vmConsensusEquivalence: ok ? "NOT_CLAIMED" : "INVALID",
      mainnet: ok ? "BLOCKED_BY_POLICY" : "INVALID"
    },
    issues
  };
}

function verifyGroth16Fixture(dir: string, manifest: any, issues: ZkIssue[]) {
  if (!manifest) return;
  const proofPath = path.join(dir, manifest.proof ?? "proof.json");
  const inputsPath = path.join(dir, manifest.publicInputs ?? "public-inputs.json");
  const keyPath = path.join(dir, manifest.verificationKey ?? "verification-key.json");
  const metadataPath = path.join(
    dir,
    manifest.verifierMetadata ?? "verifier-metadata.json"
  );
  const reportPath = path.join(dir, manifest.verifyReport ?? "verify-report.json");
  const proof = readJson(proofPath, issues);
  const publicInputs = readJson(inputsPath, issues);
  const verificationKey = readJson(keyPath, issues);
  const metadata = readJson(metadataPath, issues);
  const report = readJson(reportPath, issues);

  if (!proof || !publicInputs || !verificationKey || !metadata || !report) return;

  verifyManifestHash(manifest, "proof", proof, issues, proofPath);
  verifyManifestHash(manifest, "publicInputs", publicInputs, issues, inputsPath);
  verifyManifestHash(manifest, "verificationKey", verificationKey, issues, keyPath);
  verifyManifestHash(manifest, "verifierMetadata", metadata, issues, metadataPath);
  verifyManifestHash(manifest, "verifyReport", report, issues, reportPath);

  const publicInputsHash = calculateContentHash(publicInputs);
  const verificationKeyHash = calculateContentHash(verificationKey);
  const proofHash = calculateContentHash(proof);
  expectEqual(
    proof.publicInputsHash,
    publicInputsHash,
    issues,
    "ZK_GROTH16_PUBLIC_INPUTS_HASH_MISMATCH",
    proofPath
  );
  expectEqual(
    proof.verificationKeyHash,
    verificationKeyHash,
    issues,
    "ZK_GROTH16_VERIFICATION_KEY_HASH_MISMATCH",
    proofPath
  );
  expectEqual(
    metadata.proofHash,
    proofHash,
    issues,
    "ZK_GROTH16_PROOF_HASH_MISMATCH",
    metadataPath
  );
  expectEqual(
    metadata.publicInputsHash,
    publicInputsHash,
    issues,
    "ZK_GROTH16_PUBLIC_INPUTS_HASH_MISMATCH",
    metadataPath
  );
  expectEqual(
    metadata.verificationKeyHash,
    verificationKeyHash,
    issues,
    "ZK_GROTH16_VERIFICATION_KEY_HASH_MISMATCH",
    metadataPath
  );
  expectEqual(
    report.status,
    "ZK_FIXTURE_COHERENCE_PASS",
    issues,
    "ZK_GROTH16_REPORT_STATUS_INVALID",
    reportPath
  );
  expectEqual(
    report.claims?.zkOnchainVerification,
    "NOT_CLAIMED",
    issues,
    "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
    reportPath
  );

  const coherenceDigest = calculateContentHash({
    proofSystem: "groth16",
    proofHash,
    publicInputsHash,
    verificationKeyHash,
    statementHash: publicInputs.statementHash,
    verifierAdapter: manifest.verifierAdapter
  });
  expectEqual(
    metadata.coherenceDigest,
    coherenceDigest,
    issues,
    "ZK_GROTH16_COHERENCE_MISMATCH",
    metadataPath
  );
  expectEqual(
    report.coherenceDigest,
    coherenceDigest,
    issues,
    "ZK_GROTH16_COHERENCE_MISMATCH",
    reportPath
  );
}

function unsupportedVerification(
  resolved: string,
  workspaceRoot: string,
  proofSystem: ZkProofSystem,
  issues: ZkIssue[],
  verifierAdapter?: string
): ZkProofVerifyResult {
  return {
    ok: false,
    schema: HardkasSchemas.ZkProofVerificationV1,
    path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
    proofSystem,
    status: "ZK_VERIFIER_UNSUPPORTED",
    experimental: true,
    summary: {
      ...(verifierAdapter ? { verifierAdapter } : {}),
      contentHashes: issues.some((issue) => issue.code.includes("HASH"))
        ? "FAIL"
        : "PASS",
      localVerification: "FAIL"
    },
    claims: zkClaims(),
    issues: [
      ...issues,
      {
        code: "ZK_VERIFIER_UNSUPPORTED",
        message: `No local verifier is available for proof system ${proofSystem}.`
      }
    ]
  };
}

function resolveManifestPath(resolved: string, issues: ZkIssue[]): string | undefined {
  if (!fs.existsSync(resolved)) {
    issues.push({
      code: "ZK_PROOF_FILE_MISSING",
      message: `Missing ${resolved}.`,
      file: resolved
    });
    return undefined;
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) return path.join(resolved, "manifest.json");
  return resolved;
}

function collectFixtureFiles(manifest: any): Array<{ key: string; file: string }> {
  if (!manifest) return [];
  return [
    ["proof", manifest.proof],
    ["publicInputs", manifest.publicInputs],
    ["verificationKey", manifest.verificationKey],
    ["verifierMetadata", manifest.verifierMetadata],
    ["verifyReport", manifest.verifyReport],
    ["receipt", manifest.receipt],
    ["journal", manifest.journal],
    ["imageId", manifest.imageId]
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, file]) => ({ key, file }));
}

function detectProofSystem(manifest: any, resolved: string): ZkProofSystem {
  const declared = manifest?.proofSystem;
  if (declared === "groth16" || declared === "risc0") return declared;
  const lower = resolved.toLowerCase();
  if (lower.includes("groth16")) return "groth16";
  if (lower.includes("risc0")) return "risc0";
  return "unknown";
}

function verifyManifestHash(
  manifest: any,
  key: string,
  value: any,
  issues: ZkIssue[],
  filePath: string
) {
  const expected = manifest.contentHashes?.[key];
  if (typeof expected !== "string") {
    issues.push({
      code: "ZK_CORPUS_HASH_MISSING",
      message: `Missing content hash for ${key}.`,
      file: filePath
    });
    return;
  }
  const actual = calculateContentHash(value);
  if (actual !== expected) {
    issues.push({
      code: "ZK_CORPUS_HASH_MISMATCH",
      message: `Expected ${expected}, got ${actual}.`,
      file: filePath
    });
  }
}

function readJson(filePath: string, issues: ZkIssue[]): any | undefined {
  if (!fs.existsSync(filePath)) {
    issues.push({
      code: "ZK_FILE_MISSING",
      message: `Missing ${filePath}.`,
      file: filePath
    });
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error: any) {
    issues.push({
      code: "ZK_JSON_INVALID",
      message: error?.message || `Invalid JSON in ${filePath}.`,
      file: filePath
    });
    return undefined;
  }
}

function expectEqual(
  actual: unknown,
  expected: unknown,
  issues: ZkIssue[],
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

function zkClaims(): ZkCapabilities["claims"] {
  return {
    zkArtifactCoherence: "EXPERIMENTAL",
    zkLocalVerification: "EXPERIMENTAL_FIXTURE_ONLY",
    zkOnchainVerification: "NOT_CLAIMED",
    vmConsensusEquivalence: "NOT_CLAIMED",
    mainnet: "BLOCKED_BY_POLICY"
  };
}
