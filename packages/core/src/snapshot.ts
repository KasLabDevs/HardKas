import fs from "node:fs/promises";
import path from "node:path";

export interface SnapshotManifest {
  snapshotVersion: number;
  createdAt: string;
  hardkasVersion: string;
  stateAuthority: "filesystem";
  projectionAuthority: "sqlite";
  deterministicScope: "local-only" | "consensus-validated";
  consensusValidated: boolean;
  includedArtifacts: number;
  excludedArtifacts: number;
  corruptedArtifacts: number;
}

export interface CreateSnapshotOptions {
  hardkasDir: string;
  outputDir: string;
  deterministicScope?: "local-only" | "consensus-validated";
}

export async function createSnapshot(options: CreateSnapshotOptions): Promise<SnapshotManifest> {
  const { hardkasDir, outputDir, deterministicScope = "local-only" } = options;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(outputDir, "projections"), { recursive: true });
  await fs.mkdir(path.join(outputDir, "events"), { recursive: true });
  await fs.mkdir(path.join(outputDir, "replay"), { recursive: true });
  await fs.mkdir(path.join(outputDir, "metadata"), { recursive: true });

  let included = 0;
  let excluded = 0;
  let corrupted = 0;

  // 1. Copy artifacts (authority)
  const artifactsDir = path.join(hardkasDir, "artifacts");
  try {
    const list = await fs.readdir(artifactsDir);
    for (const f of list) {
      if (f.endsWith(".json")) {
        const src = path.join(artifactsDir, f);
        const dest = path.join(outputDir, "artifacts", f);
        
        try {
          const content = await fs.readFile(src, "utf-8");
          const parsed = JSON.parse(content);
          if (parsed.schema && parsed.schema.startsWith("hardkas.")) {
            // Note: A real snapshot would verify integrity here
            await fs.copyFile(src, dest);
            included++;
          } else {
            excluded++;
          }
        } catch {
          corrupted++;
        }
      }
    }
  } catch {
    // Receipts dir might not exist
  }

  // 2. Copy events append-log
  try {
    const eventsLog = path.join(hardkasDir, "events.jsonl");
    await fs.copyFile(eventsLog, path.join(outputDir, "events", "events.jsonl"));
  } catch {
    // ignore
  }

  // 3. Copy sqlite database (projection cache)
  try {
    const dbPath = path.join(hardkasDir, "store.db");
    await fs.copyFile(dbPath, path.join(outputDir, "projections", "store.db"));
  } catch {
    // ignore
  }

  const manifest: SnapshotManifest = {
    snapshotVersion: 1,
    createdAt: new Date().toISOString(),
    hardkasVersion: "0.7.1-alpha",
    stateAuthority: "filesystem",
    projectionAuthority: "sqlite",
    deterministicScope,
    consensusValidated: deterministicScope === "consensus-validated",
    includedArtifacts: included,
    excludedArtifacts: excluded,
    corruptedArtifacts: corrupted
  };

  await fs.writeFile(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  return manifest;
}

export async function readSnapshotManifest(snapshotDir: string): Promise<SnapshotManifest> {
  const manifestPath = path.join(snapshotDir, "manifest.json");
  const content = await fs.readFile(manifestPath, "utf-8");
  return JSON.parse(content) as SnapshotManifest;
}
