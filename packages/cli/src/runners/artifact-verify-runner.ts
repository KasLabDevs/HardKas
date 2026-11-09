import {
  verifyArtifactIntegrity,
  verifyArtifactSemantics,
  verifyArtifactReplay
} from "@hardkas/artifacts";
import { UI } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import { HardkasSchemas } from "@hardkas/artifacts";
import { stripBom } from "@hardkas/core";

export interface ArtifactVerifyOptions {
  path: string;
  json?: boolean;
  /** Verify every JSON file under a directory. Undefined = decided by the target (directory → recursive). */
  recursive?: boolean | undefined;
  strict?: boolean;
  workspaceRoot: string;
  /**
   * Closure Pack D-Q20: the target must be contained in the workspace
   * (`hardkas verify [path]`). `artifact verify <path>` keeps accepting any
   * explicit path (references still resolve inside the workspace store).
   */
  containedInWorkspace?: boolean;
  /** The command name echoed in the JSON envelope. */
  command?: string;
  /**
   * `hardkas verify` store verification (review B1): a LEGACY source whose re-issue
   * is certified and present is reported SUPERSEDED_BY_MIGRATION (info) instead of
   * MIGRATION_REQUIRED. Nothing else changes; no reference resolution is affected.
   */
  storeVerification?: boolean;
  /**
   * INT9-A (I-1): the network level. Without any of these the verification is offline (integrity only; the network and
   * consensus levels are NOT_CHECKED). With them: one read-only look at a node of the artifact's network (never mainnet).
   */
  network?: string | undefined;
  url?: string | undefined;
  since?: string | undefined;
  minConfirmations?: string | undefined;
  /** The level the verification must reach to succeed: integrity (default), network or consensus. */
  require?: string | undefined;
}

function realpathOr(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function runArtifactVerify(options: ArtifactVerifyOptions) {
  // WORKSPACE-AUTHORITY-1 (WA-I3): verifying reads; it never opens (and so never bootstraps) a workspace. The target is
  // resolved against the workspace root, as before.
  const absolutePath = path.resolve(options.workspaceRoot, options.path);
  const command = options.command ?? "artifact verify";
  const strict = options.strict ?? false;

  if (options.containedInWorkspace) {
    const root = path.resolve(options.workspaceRoot);
    const real = realpathOr(absolutePath);
    if (!isWithin(root, absolutePath) && !isWithin(realpathOr(root), real)) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "ARTIFACT_PATH_OUTSIDE_WORKSPACE",
        `Verification target is outside the workspace: ${options.path} (D-Q20: hardkas verify accepts workspace-contained paths only)`,
        { exitCode: 1 }
      );
    }
  }

  if (!fs.existsSync(absolutePath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("PATH_NOT_FOUND", `Path not found: ${options.path}`, {
      exitCode: 1
    });
  }

  const stats = fs.statSync(absolutePath);
  const isDir = stats.isDirectory();

  // INT9-A (I-1): the network check is per artifact (one look per transaction); it is never applied to a directory
  const { networkCheckRequested, parseRequirement } = await import("./artifact-network-runner.js");
  const requirement = parseRequirement(options.require);
  const wantsNetwork = networkCheckRequested(options);
  if (isDir && wantsNetwork) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "ARTIFACT_VERIFY_NETWORK_SINGLE_FILE",
      `--network, --url, --since and --require network|consensus verify one artifact on its network; ${options.path} is a directory (verify it offline, or name one artifact). Nothing was contacted.`,
      { exitCode: 2 }
    );
  }

  if (isDir) {
    if (options.recursive ?? true) {
      return runRecursiveVerify(absolutePath, { ...options, strict, command });
    } else {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "IS_DIRECTORY",
        `${options.path} is a directory. Use --recursive to verify all artifacts within it.`,
        { exitCode: 1 }
      );
    }
  }

  // Single file verification. AUD-12: the integrity gate runs under the same
  // strictness as the semantic audit (strict → MIGRATION_REQUIRED for legacy).
  let result = await verifyArtifactIntegrity(absolutePath, {
    strict,
    workspaceRoot: options.workspaceRoot
  });

  // N-6: a file that is not JSON is a typed refusal, never an untyped UNKNOWN_ERROR.
  const parsedSingle = readArtifactJson(absolutePath);
  if (!parsedSingle.ok) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("ARTIFACT_JSON_INVALID", `${options.path} is not a JSON artifact: ${parsedSingle.message}`, { exitCode: 1 });
  }
  const artifact = parsedSingle.value;
  const semanticResult = verifyArtifactSemantics(artifact, {
    strict,
    workspaceRoot: options.workspaceRoot
  });

  // 3. Replay Audit (Honesty Check)
  const replayResult = await verifyArtifactReplay(artifact, {
    strict
  });

  // Merge issues
  result.issues.push(...semanticResult.issues);
  result.issues.push(...replayResult.issues);

  result.errors.push(...semanticResult.errors);
  result.errors.push(...replayResult.errors);

  result.ok = result.ok && semanticResult.ok;
  // Note: we don't necessarily make the whole thing fail just because replay is not implemented,
  // unless strict mode is on and replay was specifically requested?
  // For now, we follow the user request: result.ok is true only if integrity and semantics are ok.
  // Replay issues will show as warnings/errors.

  // INT9-A (I-1): the three levels. Integrity is the offline verdict above, on every network (mainnet included). The
  // network and consensus levels are NOT_CHECKED unless a check was asked for, and never for a failed artifact.
  const net = await import("./artifact-network-runner.js");
  const { notCheckedNetworkVerification } = await import("@hardkas/sdk");
  const networkCheck = !result.ok
    ? notCheckedNetworkVerification("INTEGRITY_FAILED", "the artifact failed integrity: no node is asked about it")
    : wantsNetwork
      ? await net.checkArtifactOnNetwork(artifact, {
          network: options.network,
          url: options.url,
          since: options.since,
          minConfirmations: options.minConfirmations,
          workspaceRoot: options.workspaceRoot
        })
      : notCheckedNetworkVerification("OFFLINE", "offline verification: no node was asked (use --network/--url for the network level)");
  const verdict = net.verdictLevelOf(result.ok, networkCheck);
  (result as any).levels = {
    integrity: result.ok ? "INTEGRITY_VERIFIED" : "INTEGRITY_FAILED",
    network: networkCheck.network,
    consensus: networkCheck.consensus,
    verdict,
    required: requirement
  };
  const requirementOk = net.requirementMet(requirement, verdict);

  if (options.json) {
    // AUD-07 / IC-4′.6 (SEC-A): the envelope's `ok` IS the verdict, and a failed
    // verdict exits non-zero with a deterministic code.
    const { getOutput } = await import("../output.js");
    getOutput().writeJson({
      ok: result.ok && requirementOk,
      ...(result.ok && !requirementOk ? { code: "VERIFICATION_LEVEL_NOT_REACHED" } : {}),
      command,
      mode: "cli",
      result
    });
    if (!result.ok) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("VERIFICATION_FAILED", "Artifact verification failed.", {
        exitCode: 1
      });
    }
    if (!requirementOk) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("VERIFICATION_LEVEL_NOT_REACHED", `The artifact reached ${verdict}; --require ${requirement} was asked.`, { exitCode: 1 });
    }
    return result;
  }

  UI.header(`Artifact Verification: ${path.basename(options.path)}`);

  if (result.ok) {
    UI.success("VERIFICATION SUCCESSFUL");
    console.log(`  Type:    ${result.artifactType}`);
    console.log(`  Version: ${result.version}`);
    console.log(`  Hash:    ${result.actualHash}`);
    // D-Q21 / AUX-03: `valid` means integrity for THIS authentication scope.
    console.log(`  Scope:   ${result.authScope}${result.unauthenticatedMaterialFields.length ? ` (never authenticated: ${result.unauthenticatedMaterialFields.join(", ")})` : ""}`);

    if (strict) {
      console.log(`\nOperational Audit (STRICT):`);
      if (semanticResult.ok) {
        UI.success("  ✓ Economic & Lineage invariants verified.");
      } else {
        UI.error("  ✗ Semantic invariants VIOLATED.");
      }
    }

    console.log(`\nReplay Verification:`);
    if (replayResult.ok) {
      UI.success("  ✓ Replay verified.");
    } else {
      const replayIssue = replayResult.issues.find(
        (i) => i.code === "REPLAY_UNSUPPORTED_CHECK"
      );
      if (replayIssue) {
        UI.warning("  ⚠ REPLAY UNSUPPORTED (Consensus simulation skipped)");
      } else {
        UI.error("  ✗ Replay verification FAILED.");
      }
    }

    // INT9-A (I-1): the three levels, each with what it rests on
    const n = networkCheck.network as any;
    const c = networkCheck.consensus as any;
    console.log(`\nLevels:`);
    console.log(`  Integrity: INTEGRITY_VERIFIED (offline)`);
    const nodeLine = n.node
      ? ` · node ${n.node.nodeType} ${n.node.evidence?.serverVersion ?? ""} at ${n.node.endpoint ?? "?"} (${n.node.trust}, sync ${n.node.sync})`
      : "";
    console.log(`  Network:   ${n.level}${n.reason ? ` [${n.reason}]` : ""}${n.observation ? ` · ${n.observation.source}: ${n.observation.scope}` : n.message ? ` · ${n.message}` : ""}${nodeLine}`);
    console.log(
      `  Consensus: ${c.level}${c.reason ? ` [${c.reason}]` : ""}${c.message ? ` · ${c.message}` : ""} · policy ${c.policy.policyId} v${c.policy.policyVersion} (≥ ${c.policy.minConfirmations} blue-score)`
    );
    console.log(`  Verdict:   ${verdict}${requirement !== "integrity" ? ` (required: ${requirement})` : ""}`);
    if (!requirementOk) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("VERIFICATION_LEVEL_NOT_REACHED", `The artifact reached ${verdict}; --require ${requirement} was asked.`, { exitCode: 1 });
    }
  } else {
    UI.error("VERIFICATION FAILED");
    renderErrors(result);
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("VERIFICATION_FAILED", "Artifact verification failed.", {
      exitCode: 1
    });
  }

  return result;
}

/** Reads and parses one artifact file (BOM tolerated); a parse failure is returned, never thrown. */
function readArtifactJson(file: string): { ok: true; value: any } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(stripBom(fs.readFileSync(file, "utf-8"))) };
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e).slice(0, 200) };
  }
}

async function runRecursiveVerify(dir: string, options: ArtifactVerifyOptions & { strict: boolean; command: string }) {
  const files = getAllJsonFiles(dir);
  if (!options.json) {
    UI.header(`Recursive Verification: ${path.basename(dir)}`);
    console.log(`Auditing ${files.length} artifact(s)...\n`);
  }

  let successCount = 0;
  let failCount = 0;
  const jsonResults: any[] = [];

  for (const file of files) {
    const relativePath = path.relative(dir, file);

    // 1. Integrity Check (AUD-12: under the requested strictness)
    const result = await verifyArtifactIntegrity(file, {
      strict: options.strict,
      workspaceRoot: options.workspaceRoot
    });

    // 2. Semantic & Lineage Audit. N-6: one file that is not JSON fails on its own; the scan goes on.
    const parsedFile = readArtifactJson(file);
    if (!parsedFile.ok) {
      result.ok = false;
      result.issues.push({ code: "ARTIFACT_JSON_INVALID", severity: "error", message: `not a JSON artifact: ${parsedFile.message}` } as any);
      result.errors.push(`not a JSON artifact: ${parsedFile.message}`);
      if (options.json) jsonResults.push({ file: relativePath, result });
      if (!options.json) {
        console.log(`  ✗ ${relativePath.padEnd(40)} [FAIL]`);
        console.log(`      [!] [ARTIFACT_JSON_INVALID] not a JSON artifact: ${parsedFile.message}`);
      }
      failCount++;
      continue;
    }
    const artifact = parsedFile.value;

    // Source-side migration tolerance (review B1), store verification only: the
    // ONLY error may be MIGRATION_REQUIRED, and every supersession condition must
    // hold (FULL receipt, re-issue present and strictly verified, real lineage link).
    if (
      options.storeVerification &&
      options.strict &&
      result.issues.some((i) => i.code === "MIGRATION_REQUIRED") &&
      result.issues.every(
        (i) => i.code === "MIGRATION_REQUIRED" || (i.severity !== "error" && i.severity !== "critical")
      )
    ) {
      const { findSupersedingMigration } = await import("@hardkas/artifacts");
      const superseding = findSupersedingMigration(options.workspaceRoot, artifact);
      if (superseding) {
        const replaced = new Set(result.issues.filter((i) => i.code === "MIGRATION_REQUIRED").map((i) => i.message));
        result.issues = result.issues.filter((i) => i.code !== "MIGRATION_REQUIRED");
        result.errors = result.errors.filter((m) => !replaced.has(m));
        result.issues.push({
          code: "SUPERSEDED_BY_MIGRATION",
          severity: "info",
          message: `Legacy source (authScope ${result.authScope}) re-issued as ${superseding.newArtifactId} by migration receipt ${superseding.receiptId}; it stays LEGACY and no decision path accepts it`
        });
        result.ok = result.issues.every((i) => i.severity !== "error" && i.severity !== "critical");
      }
    }
    // Wave 1.2 · IC-5′.6–.7: references resolve only by verified identity — first
    // among the files being verified (recursive mode audits a set that may live
    // outside the store), then in the workspace store. Never by label, txId,
    // top-level artifactId or file name, never relative to cwd.
    const { checkArtifactIdentity } = await import("@hardkas/artifacts");
    const semanticResult = verifyArtifactSemantics(artifact, {
      strict: options.strict,
      workspaceRoot: options.workspaceRoot,
      resolveArtifact: (id) => {
        for (const f of files) {
          try {
            const obj = JSON.parse(stripBom(fs.readFileSync(f, "utf-8")));
            const identity = checkArtifactIdentity(obj);
            if (identity.ok && identity.artifactId === id) return obj;
          } catch {}
        }
        return null;
      }
    });

    // Merge results
    result.issues.push(...semanticResult.issues);
    result.errors.push(...semanticResult.errors);
    result.ok = result.ok && semanticResult.ok;

    if (options.json) {
      jsonResults.push({ file: relativePath, result });
    }

    if (result.ok) {
      if (!options.json) console.log(`  ✓ ${relativePath.padEnd(40)} [MATCH]`);
      successCount++;
    } else {
      if (!options.json) {
        console.log(`  ✗ ${relativePath.padEnd(40)} [FAIL]`);
        result.issues.forEach((issue) => {
          const prefix =
            issue.severity === "critical"
              ? "[!!!]"
              : issue.severity === "error"
                ? "[!]"
                : "[?]";
          console.log(`      ${prefix} [${issue.code}] ${issue.message}`);
        });
      }
      failCount++;
    }
  }

  if (options.json) {
    const { getOutput } = await import("../output.js");
    const envelope = {
      ok: failCount === 0,
      command: options.command,
      mode: "cli" as const,
      result: {
        schema: HardkasSchemas.QueryVerifyV1,
        scanned: files.length,
        successCount,
        failCount,
        results: jsonResults
      }
    };
    getOutput().writeJson(envelope);
    if (failCount > 0) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("VERIFICATION_FAILED", "Recursive verification failed.", {
        exitCode: 1
      });
    }
    return;
  }

  console.log("\n" + "═".repeat(50));
  if (failCount === 0) {
    UI.success(`Audit Complete: All ${successCount} artifacts verified.`);
  } else {
    UI.error(`Audit Failed: ${failCount} artifact(s) corrupted or invalid.`);
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("VERIFICATION_FAILED", "Recursive verification failed.", {
      exitCode: 1
    });
  }
}

function getAllJsonFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllJsonFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith(".json")) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function renderErrors(result: any) {
  if (result.artifactType) console.log(`  Type:    ${result.artifactType}`);
  if (result.version) console.log(`  Version: ${result.version}`);
  if (result.authScope) console.log(`  Scope:   ${result.authScope}`);

  if (result.expectedHash || result.actualHash) {
    console.log(`  Expected Hash: ${result.expectedHash || "None"}`);
    console.log(`  Actual Hash:   ${result.actualHash || "N/A"}`);
  }

  console.log("\nIssues:");
  result.issues.forEach((issue: any) => {
    const prefix =
      issue.severity === "critical"
        ? "CRITICAL: "
        : issue.severity === "error"
          ? "ERROR:    "
          : "WARNING:  ";
    console.log(`- ${prefix}[${issue.code}] ${issue.message}`);
  });
}
