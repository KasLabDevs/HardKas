import { HardkasSchemas, HardkasError } from "@hardkas/core";
import type { ScenarioResult, EvidencePackage } from "@hardkas/artifacts";
import { recomputeDeclaredContentHash, verifyArtifactIntegrity } from "@hardkas/artifacts";
import path from "node:path";
import fs from "node:fs";

// SURFACE-TRUTH-1A (ST-I2): a package's verdict is bound by the identity that already covers it. The scenario result is
// a sealed v5 artifact (its one producer, `createScenarioResultArtifact`), so its contentHash commits to the verdict
// (`status`, `error`), the run (`scenarioName`, `networkId`, `mode`) and the membership (`artifactsGenerated`, the
// contentHashes of what the run wrote). `pack` carries exactly those artifacts; `verify` checks that identity, that the
// package repeats it, and that the artifacts carried are exactly the ones it names, each intact. The package format is
// unchanged. Like all HardKAS evidence it is unsigned: a forger who re-seals every piece produces a consistent package.

export interface EvidencePackOptions {
  scenarioResultPath: string;
  workspaceRoot: string;
  outPath?: string;
}

export interface EvidenceVerifyResult {
  ok: boolean;
  status:
    | "EVIDENCE_VERIFIED"
    | "EVIDENCE_ARTIFACT_HASH_MISMATCH"
    | "EVIDENCE_POLICY_VIOLATION"
    | "EVIDENCE_INVALID_SCHEMA"
    | "EVIDENCE_SCENARIO_RESULT_INVALID"
    | "EVIDENCE_PACKAGE_INCONSISTENT"
    | "EVIDENCE_MEMBERSHIP_MISMATCH";
  details?: string;
}

const listIds = (ids: readonly string[], max = 5) => `${ids.slice(0, max).join(", ")}${ids.length > max ? ` (+${ids.length - max})` : ""}`;

export class EvidenceManager {
  /**
   * Packs a Scenario Result into a verifiable Evidence Package V1
   */
  static async pack(options: EvidencePackOptions): Promise<string> {
    if (!fs.existsSync(options.scenarioResultPath)) {
      throw new Error(`Scenario result not found: ${options.scenarioResultPath}`);
    }

    const rawResult = fs.readFileSync(options.scenarioResultPath, "utf-8");
    const scenarioResult = JSON.parse(rawResult) as ScenarioResult;

    // The verdict's own identity first: an unsealed or edited scenario result binds nothing.
    const sealed = await verifyArtifactIntegrity(scenarioResult);
    if (!sealed.ok) {
      throw new HardkasError(
        "EVIDENCE_SCENARIO_RESULT_INVALID",
        `Refusing to pack ${options.scenarioResultPath}: it is not a sealed, intact hardkas.scenarioResult.v1 (${sealed.errors.join("; ")}).`
      );
    }

    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    const store = new ProjectArtifactStore(options.workspaceRoot);
    const canonicalEntries = await store.enumerateCanonicalArtifacts();

    // Exactly the artifacts the scenario names, by identity (contentHash), each once. A scenario that names none gets
    // a package with none: the former fallback (every artifact in the store) and substring matching are gone.
    const byIdentity = new Map<string, any>();
    for (const entry of canonicalEntries) {
      if (typeof entry.contentHash === "string" && !byIdentity.has(entry.contentHash)) byIdentity.set(entry.contentHash, entry.artifact);
    }
    const named = [...new Set(scenarioResult.artifactsGenerated ?? [])];
    const unresolved = named.filter((id) => !byIdentity.has(id));
    if (unresolved.length > 0) {
      throw new HardkasError(
        "EVIDENCE_PACK_ARTIFACT_UNRESOLVED",
        `Refusing to pack: the scenario names ${unresolved.length} artifact(s) the workspace store does not hold (${listIds(unresolved)}); a package never leaves out what its scenario names.`,
        { metadata: { unresolved } }
      );
    }
    const altered = named.filter((id) => recomputeDeclaredContentHash(byIdentity.get(id)) !== id);
    if (altered.length > 0) {
      throw new HardkasError(
        "EVIDENCE_PACK_ARTIFACT_INVALID",
        `Refusing to pack: ${altered.length} named artifact(s) no longer hash to their identity in the store (${listIds(altered)}); run \`hardkas verify\`.`,
        { metadata: { altered } }
      );
    }

    const artifacts: any[] = named.map((id) => byIdentity.get(id));
    const hashes: Record<string, string> = Object.fromEntries(named.map((id) => [id, id]));

    const pkg: EvidencePackage = {
      version: "1.0.0-alpha",
      schema: HardkasSchemas.EvidencePackageV1 as any,
      name: scenarioResult.scenarioName,
      hardkasVersion: "0.12.0-rc.26",
      networkId: scenarioResult.networkId,
      mode: scenarioResult.mode,
      createdAt: new Date().toISOString(),
      scenarioResult,
      artifacts,
      hashes,
      claims: {
        mainnet: false,
        testnet: false,
        production: false,
        bridgeReady: false,
        onchainZk: false
      },
      artifactDiscovery: {
        source: "scenarioResult"
      }
    };

    const targetName = options.outPath || path.join(options.workspaceRoot, `${scenarioResult.scenarioName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.hke.json`);
    const data = JSON.stringify(pkg, null, 2);
    // an --out inside the artifact store goes through the store's gate (ARTIFACT-MUTATION-1)
    const { writeFileRespectingStore } = await import("@hardkas/artifacts");
    await writeFileRespectingStore(targetName, data, () => fs.writeFileSync(targetName, data, "utf-8"));

    return targetName;
  }

  /**
   * Verifies an Evidence Package V1
   */
  static async verify(packagePath: string): Promise<EvidenceVerifyResult> {
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Evidence package not found: ${packagePath}`);
    }

    const raw = fs.readFileSync(packagePath, "utf-8");
    const pkg = JSON.parse(raw) as EvidencePackage;

    if (pkg.schema !== "hardkas.evidencePackage.v1") {
      return { ok: false, status: "EVIDENCE_INVALID_SCHEMA", details: "Invalid schema" };
    }

    // Verify Claims
    if (pkg.claims.mainnet || pkg.claims.testnet || pkg.claims.production || pkg.claims.bridgeReady || pkg.claims.onchainZk) {
      return {
        ok: false,
        status: "EVIDENCE_POLICY_VIOLATION",
        details: "Package asserts forbidden claims (mainnet/testnet/production/etc) under current policy."
      };
    }

    // The verdict: the scenario result is a sealed, intact artifact (an edited status no longer hashes to its identity).
    const scenarioResult = pkg.scenarioResult as ScenarioResult | undefined;
    const sealed = scenarioResult ? await verifyArtifactIntegrity(scenarioResult) : undefined;
    if (!scenarioResult || !sealed?.ok) {
      return {
        ok: false,
        status: "EVIDENCE_SCENARIO_RESULT_INVALID",
        details: `The scenario result is not a sealed, intact hardkas.scenarioResult.v1${sealed ? ` (${sealed.errors.join("; ")})` : " (missing)"}.`
      };
    }
    const scenarioClaims = (scenarioResult as unknown as { claims?: Record<string, unknown> }).claims ?? {};
    if (Object.values(scenarioClaims).some(Boolean)) {
      return { ok: false, status: "EVIDENCE_POLICY_VIOLATION", details: "The scenario result asserts forbidden claims under current policy." };
    }
    // The package repeats the run the scenario result names.
    const repeated: Array<[string, unknown, unknown]> = [
      ["name", pkg.name, scenarioResult.scenarioName],
      ["networkId", pkg.networkId, scenarioResult.networkId],
      ["mode", pkg.mode, scenarioResult.mode]
    ];
    const inconsistent = repeated.filter(([, packaged, sealedValue]) => packaged !== sealedValue).map(([field]) => field);
    if (inconsistent.length > 0) {
      return { ok: false, status: "EVIDENCE_PACKAGE_INCONSISTENT", details: `The package disagrees with its scenario result on: ${inconsistent.join(", ")}.` };
    }

    // Each artifact carried is intact: its body hashes to the identity it declares.
    const carried: string[] = [];
    for (const artifactObj of pkg.artifacts) {
      let computedHash: string;
      try {
        computedHash = recomputeDeclaredContentHash(artifactObj);
      } catch (error) {
        return {
          ok: false,
          status: "EVIDENCE_ARTIFACT_HASH_MISMATCH",
          details: error instanceof Error ? error.message : String(error)
        };
      }
      const declared = (artifactObj as { contentHash?: unknown } | null)?.contentHash;
      if (declared !== computedHash) {
        return {
          ok: false,
          status: "EVIDENCE_ARTIFACT_HASH_MISMATCH",
          details: `An artifact declares ${String(declared)} but hashes to ${computedHash}.`
        };
      }
      carried.push(computedHash);
    }

    // Membership: exactly the artifacts the sealed scenario result names, each once, and the hash list says the same.
    const named = new Set(scenarioResult.artifactsGenerated ?? []);
    const carriedSet = new Set(carried);
    const missing = [...named].filter((id) => !carriedSet.has(id));
    const unnamed = [...carriedSet].filter((id) => !named.has(id));
    const hashValues = Object.values(pkg.hashes ?? {});
    const hashesAgree =
      hashValues.length === carried.length && new Set(hashValues).size === hashValues.length && hashValues.every((h) => carriedSet.has(h));
    if (missing.length > 0 || unnamed.length > 0 || carriedSet.size !== carried.length || !hashesAgree) {
      const why = [
        missing.length ? `named but not carried: ${listIds(missing)}` : "",
        unnamed.length ? `carried but not named: ${listIds(unnamed)}` : "",
        carriedSet.size !== carried.length ? "an artifact is carried twice" : "",
        !hashesAgree ? "the hash list does not match the artifacts carried" : ""
      ].filter(Boolean);
      return { ok: false, status: "EVIDENCE_MEMBERSHIP_MISMATCH", details: `The package does not carry exactly what its scenario result names (${why.join("; ")}).` };
    }

    return { ok: true, status: "EVIDENCE_VERIFIED" };
  }

  /**
   * Explains an Evidence Package V1
   */
  static async explain(packagePath: string): Promise<string> {
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Evidence package not found: ${packagePath}`);
    }

    const raw = fs.readFileSync(packagePath, "utf-8");
    const pkg = JSON.parse(raw) as EvidencePackage;

    let explanation = `Evidence Package V1: ${pkg.name}\n`;
    explanation += `Mode: ${pkg.mode}\n`;
    explanation += `Status: ${pkg.scenarioResult?.status}\n`;
    explanation += `Total Artifacts Bundled: ${pkg.artifacts.length}\n`;
    explanation += `Discovery Method: ${pkg.artifactDiscovery?.source}\n`;
    explanation += `\nClaims:\n`;
    for (const [k, v] of Object.entries(pkg.claims)) {
      explanation += `  - ${k}: ${v}\n`;
    }

    return explanation;
  }
}
