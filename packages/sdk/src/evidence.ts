import { HardkasSchemas } from "@hardkas/core";
import type { ScenarioResult, EvidencePackage } from "@hardkas/artifacts";
import { calculateContentHash } from "@hardkas/artifacts";
import path from "node:path";
import fs from "node:fs";

export interface EvidencePackOptions {
  scenarioResultPath: string;
  workspaceRoot: string;
  outPath?: string;
}

export interface EvidenceVerifyResult {
  ok: boolean;
  status: "EVIDENCE_VERIFIED" | "EVIDENCE_ARTIFACT_HASH_MISMATCH" | "EVIDENCE_POLICY_VIOLATION" | "EVIDENCE_INVALID_SCHEMA";
  details?: string;
}

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

    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    const store = new ProjectArtifactStore(options.workspaceRoot);
    const canonicalEntries = await store.enumerateCanonicalArtifacts();

    const artifacts: any[] = [];
    const hashes: Record<string, string> = {};
    const seenHashes = new Set<string>();

    const generatedIds = new Set(scenarioResult.artifactsGenerated || []);

    for (const entry of canonicalEntries) {
      const art = entry.artifact;
      if (!art || typeof art !== "object") continue;

      // Exclude scenario results or .hke packages from being bundled inside evidence packages
      if (
        art.schema?.includes("scenarioResult") ||
        entry.relativeSubpath.includes("scenario-result") ||
        entry.relativeSubpath.endsWith(".hke.json")
      ) {
        continue;
      }

      // If scenarioResult specified explicit generatedIds, filter by them; otherwise include all canonical artifacts
      if (
        generatedIds.size > 0 &&
        !generatedIds.has(entry.id) &&
        !Array.from(generatedIds).some(gId => entry.id.includes(gId) || entry.relativeSubpath.includes(gId))
      ) {
        continue;
      }

      const hashKey = entry.contentHash || entry.id || entry.relativeSubpath;
      if (seenHashes.has(hashKey)) continue;
      seenHashes.add(hashKey);

      artifacts.push(art);
      hashes[hashKey] = entry.contentHash || calculateContentHash(art);
    }

    const pkg: EvidencePackage = {
      version: "1.0.0-alpha",
      schema: HardkasSchemas.EvidencePackageV1 as any,
      name: scenarioResult.scenarioName,
      hardkasVersion: "0.12.0-rc.18",
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
        source: "scenarioResult+fallbackScan"
      }
    };

    const targetName = options.outPath || path.join(options.workspaceRoot, `${scenarioResult.scenarioName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.hke.json`);
    
    fs.writeFileSync(targetName, JSON.stringify(pkg, null, 2), "utf-8");

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

    // Verify Hashes
    for (const artifactObj of pkg.artifacts) {
      const computedHash = calculateContentHash(artifactObj);
      
      const foundHash = Object.values(pkg.hashes).includes(computedHash);
      if (!foundHash) {
        return { 
          ok: false, 
          status: "EVIDENCE_ARTIFACT_HASH_MISMATCH", 
          details: `Artifact hash mismatch. Expected to find ${computedHash} in hashes.` 
        };
      }
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
