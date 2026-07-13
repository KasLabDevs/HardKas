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

    const artifactsDir = path.join(options.workspaceRoot, ".hardkas", "artifacts");
    const generatedIds = new Set(scenarioResult.artifactsGenerated || []);

    // Fallback scan
    if (fs.existsSync(artifactsDir)) {
      const files = fs.readdirSync(artifactsDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const id = file.replace(".json", "");
          // Exclude the scenario result itself or other scenario results from being bundled as sub-artifacts
          if (!file.includes("scenario-result") && !file.includes(".hke.json")) {
            generatedIds.add(id);
          }
        }
      }
    }

    const artifacts: any[] = [];
    const hashes: Record<string, string> = {};

    for (const id of generatedIds) {
      // Find the file. It could be `<id>.json` or `<id>.trace.json` etc
      const files = fs.readdirSync(artifactsDir).filter(f => f.includes(id) && f.endsWith(".json"));
      
      for (const file of files) {
        const filePath = path.join(artifactsDir, file);
        const raw = fs.readFileSync(filePath, "utf-8");
        const artifactObj = JSON.parse(raw);
        artifacts.push(artifactObj);

        const fileKey = file.replace(".json", "");
        
        hashes[fileKey] = calculateContentHash(artifactObj);
      }
    }

    const pkg: EvidencePackage = {
      version: "1.0.0-alpha",
      schema: HardkasSchemas.EvidencePackageV1 as any,
      name: scenarioResult.scenarioName,
      hardkasVersion: "0.11.3-alpha",
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
