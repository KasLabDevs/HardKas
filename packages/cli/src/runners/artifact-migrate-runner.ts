import path from "node:path";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

// Wave 1.3 · Closure Pack D-Q1.f / IC-4′.7 / N13
//
// `hardkas artifact migrate <path> --to 5` re-issues a legacy artifact as a
// version-5 artifact plus a MigrationReceipt, written to the workspace store.
// The source is never rewritten; material fields its hash version never
// authenticated are carried only as `legacyClaims` (an unverified claim).

export interface ArtifactMigrateOptions {
  path: string;
  to: string;
  migrationId?: string;
  json?: boolean;
  workspaceRoot: string;
}

export async function runArtifactMigrate(options: ArtifactMigrateOptions) {
  const { CURRENT_HASH_VERSION } = await import("@hardkas/artifacts");
  if (!/^\d+$/.test(options.to) || Number(options.to) !== CURRENT_HASH_VERSION) {
    throw new HardkasCliError(
      "MIGRATION_TARGET_UNSUPPORTED",
      `--to ${options.to} is not a migration target; only hashVersion ${CURRENT_HASH_VERSION} is (D-Q1.f).`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });

  let out;
  try {
    out = await sdk.artifacts.migrate(options.path, {
      to: CURRENT_HASH_VERSION,
      ...(options.migrationId ? { migrationId: options.migrationId } : {})
    });
  } catch (e: any) {
    const code = typeof e?.code === "string" ? e.code : "MIGRATION_FAILED";
    throw new HardkasCliError(code, e?.message ?? String(e), { exitCode: 1 });
  }

  const rel = (p: string | undefined) => (p ? path.relative(options.workspaceRoot, p).replace(/\\/g, "/") : undefined);
  const result = {
    sourceArtifactId: out.sourceArtifactId,
    // The legacy source stays in the store: it is the re-issue's parent (review B1).
    sourcePath: rel(out.sourcePath),
    artifactId: out.migrated.contentHash,
    artifactPath: rel(out.migratedPath),
    receiptArtifactId: out.receipt.contentHash,
    receiptPath: rel(out.receiptPath),
    hashVersion: CURRENT_HASH_VERSION,
    legacyClaims: out.stripped
  };

  if (options.json) {
    const { getOutput } = await import("../output.js");
    getOutput().writeJson({ ok: true, command: "artifact migrate", mode: "cli", result });
    return result;
  }

  UI.header(`Artifact Migration: ${path.basename(options.path)}`);
  UI.success(`Re-issued as hashVersion ${CURRENT_HASH_VERSION} (a NEW identity; the source was not modified)`);
  console.log(`  Source:   ${result.sourceArtifactId} (kept in the store: ${result.sourcePath})`);
  console.log(`  Artifact: ${result.artifactId}`);
  console.log(`            ${result.artifactPath}`);
  console.log(`  Receipt:  ${result.receiptArtifactId}`);
  console.log(`            ${result.receiptPath}`);
  if (result.legacyClaims.length > 0) {
    UI.warning(`  Legacy claims (never authenticated by the source; recorded as claims, not re-issued as content): ${result.legacyClaims.join(", ")}`);
  }
  return result;
}
