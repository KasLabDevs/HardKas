import fs from "node:fs";
import path from "node:path";
import { UI } from "../ui.js";
import { getOutput } from "../output.js";
import { snapshotDirFor } from "./snapshot-dir.js";

export interface SnapshotVerifyOptions {
  idOrName: string;
  workspaceRoot: string;
  json?: boolean;
}

export interface SnapshotVerifyIssue {
  code: string;
  message: string;
  file?: string;
}

export interface SnapshotVerifyResult {
  name: string;
  path: string;
  manifest: { snapshotVersion: number; createdAt?: string; deterministicScope?: string; includedArtifacts: number };
  captured: number;
  verified: number;
  issues: SnapshotVerifyIssue[];
}

function jsonFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && entry.name.endsWith(".json")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * WORKSPACE-AUTHORITY-1 (E) · verifies the NAMED snapshot: the one `localnet snapshot create` writes under
 * `<workspace>/snapshots/<name>` and `localnet snapshot replay` restores from — one snapshot model for the three commands.
 * Its manifest must be readable, it must hold exactly the artifacts the manifest says it captured, and each of them must
 * pass the standard artifact integrity verification. Nothing is restored, and no workspace is opened or created (WA-I3).
 */
export async function runSnapshotVerify(options: SnapshotVerifyOptions): Promise<SnapshotVerifyResult> {
  const { HardkasCliError } = await import("../cli-errors.js");
  const dir = snapshotDirFor(options.workspaceRoot, options.idOrName); // a name that is not one plain segment is refused here
  if (!fs.existsSync(dir)) {
    throw new HardkasCliError("SNAPSHOT_NOT_FOUND", `Snapshot not found: ${options.idOrName}`, { exitCode: 1 });
  }

  const { readSnapshotManifest, stripBom } = await import("@hardkas/core");
  let manifest: any;
  try {
    manifest = await readSnapshotManifest(dir);
  } catch (e: unknown) {
    throw new HardkasCliError(
      "SNAPSHOT_MANIFEST_INVALID",
      `Snapshot ${options.idOrName} has no readable manifest (${path.join(dir, "manifest.json")}): ${e instanceof Error ? e.message : String(e)}`,
      { exitCode: 1 }
    );
  }

  const issues: SnapshotVerifyIssue[] = [];
  if (!manifest || typeof manifest !== "object" || typeof manifest.snapshotVersion !== "number" || typeof manifest.includedArtifacts !== "number") {
    issues.push({ code: "SNAPSHOT_MANIFEST_INVALID", message: "the manifest does not declare a snapshotVersion and an includedArtifacts count" });
  }

  const { verifyArtifactIntegrity } = await import("@hardkas/artifacts");
  const artifactsDir = path.join(dir, "artifacts");
  const files = jsonFilesUnder(artifactsDir);
  if (typeof manifest?.includedArtifacts === "number" && manifest.includedArtifacts !== files.length) {
    issues.push({
      code: "SNAPSHOT_COUNT_MISMATCH",
      message: `the manifest says ${manifest.includedArtifacts} artifact(s) were captured; the snapshot holds ${files.length}`
    });
  }

  let verified = 0;
  for (const file of files) {
    const rel = path.relative(artifactsDir, file).replace(/\\/g, "/");
    let artifact: unknown;
    try {
      artifact = JSON.parse(stripBom(fs.readFileSync(file, "utf-8")));
    } catch (e: unknown) {
      issues.push({ code: "SNAPSHOT_ARTIFACT_UNREADABLE", file: rel, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    // the captured artifact on its own (its identity and schema), never resolved against the live workspace
    const result = await verifyArtifactIntegrity(artifact);
    if (result.ok) verified++;
    else {
      issues.push({
        code: "SNAPSHOT_ARTIFACT_INVALID",
        file: rel,
        message: result.issues.filter((i) => i.severity === "error" || i.severity === "critical").map((i) => `${i.code}: ${i.message}`).join("; ") || "does not verify"
      });
    }
  }

  const result: SnapshotVerifyResult = {
    name: options.idOrName,
    path: dir,
    manifest: {
      snapshotVersion: manifest?.snapshotVersion,
      ...(manifest?.createdAt ? { createdAt: manifest.createdAt } : {}),
      ...(manifest?.deterministicScope ? { deterministicScope: manifest.deterministicScope } : {}),
      includedArtifacts: manifest?.includedArtifacts
    },
    captured: files.length,
    verified,
    issues
  };
  const ok = issues.length === 0;

  if (options.json) {
    getOutput().writeJson(
      ok
        ? { ok: true, command: "localnet snapshot verify", mode: "cli", result }
        : { ok: false, command: "localnet snapshot verify", mode: "cli", code: "SNAPSHOT_COMPROMISED", message: "Snapshot integrity compromised", result }
    );
  } else {
    UI.header(`Snapshot Verification: ${options.idOrName}`);
    console.log(`  Path:      ${dir}`);
    console.log(`  Manifest:  v${manifest?.snapshotVersion ?? "?"}${manifest?.deterministicScope ? ` (${manifest.deterministicScope})` : ""}`);
    console.log(`  Captured:  ${files.length} artifact(s) (manifest: ${manifest?.includedArtifacts ?? "?"})`);
    console.log(`  Verified:  ${verified}`);
    if (ok) {
      UI.success("Snapshot Integrity Verified");
    } else {
      for (const issue of issues) console.log(`  [!] [${issue.code}]${issue.file ? ` ${issue.file}:` : ""} ${issue.message}`);
    }
  }

  if (!ok) {
    throw new HardkasCliError("SNAPSHOT_COMPROMISED", "Snapshot Integrity Compromised", { exitCode: 1 });
  }
  return result;
}
