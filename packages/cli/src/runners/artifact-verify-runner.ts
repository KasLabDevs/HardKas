import {
  verifyArtifactIntegrity,
  verifyArtifactSemantics,
  verifyArtifactReplay
} from "@hardkas/artifacts";
import { UI } from "../ui.js";
import path from "node:path";
import fs from "node:fs";

export interface ArtifactVerifyOptions {
  path: string;
  json?: boolean;
  recursive?: boolean;
  strict?: boolean;
  deep?: boolean;
  workspaceRoot: string;
}

export async function runArtifactVerify(options: ArtifactVerifyOptions) {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const absolutePath = sdk.workspace.resolvePath(options.path);

  if (!fs.existsSync(absolutePath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("PATH_NOT_FOUND", `Path not found: ${options.path}`, {
      exitCode: 1
    });
  }

  const stats = fs.statSync(absolutePath);
  const isDir = stats.isDirectory();

  if (isDir) {
    if (options.recursive) {
      return runRecursiveVerify(absolutePath, options);
    } else {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "IS_DIRECTORY",
        `${options.path} is a directory. Use --recursive to verify all artifacts within it.`,
        { exitCode: 1 }
      );
    }
  }

  // Single file verification
  let result = await verifyArtifactIntegrity(absolutePath);

  const artifact = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  const semanticResult = verifyArtifactSemantics(artifact, {
    strict: options.strict ?? false
  });

  // 3. Replay Audit (Honesty Check)
  const replayResult = await verifyArtifactReplay(artifact, {
    strict: options.strict ?? false
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

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  UI.header(`Artifact Verification: ${path.basename(options.path)}`);

  if (result.ok) {
    UI.success("VERIFICATION SUCCESSFUL");
    console.log(`  Type:    ${result.artifactType}`);
    console.log(`  Version: ${result.version}`);
    console.log(`  Hash:    ${result.actualHash}`);

    if (options.strict) {
      console.log(`\nOperational Audit (STRICT):`);
      if (semanticResult.ok) {
        UI.success("  âœ“ Economic & Lineage invariants verified.");
      } else {
        UI.error("  âœ— Semantic invariants VIOLATED.");
      }
    }

    console.log(`\nReplay Verification:`);
    if (replayResult.ok) {
      UI.success("  âœ“ Replay verified.");
    } else {
      const replayIssue = replayResult.issues.find(
        (i) => i.code === "REPLAY_UNSUPPORTED_CHECK"
      );
      if (replayIssue) {
        UI.warning("  âš  REPLAY UNSUPPORTED (Consensus simulation skipped)");
      } else {
        UI.error("  âœ— Replay verification FAILED.");
      }
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

async function runRecursiveVerify(dir: string, options: ArtifactVerifyOptions) {
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

    // 1. Integrity Check
    const result = await verifyArtifactIntegrity(file);

    // 2. Semantic & Lineage Audit
    const artifact = JSON.parse(fs.readFileSync(file, "utf-8"));
    const semanticResult = verifyArtifactSemantics(artifact, {
      strict: options.strict ?? false,
      artifactsDir: dir,
      resolveArtifact: (id) => {
        for (const f of files) {
          try {
            const obj = JSON.parse(fs.readFileSync(f, "utf-8"));
            if (
              obj.contentHash === id ||
              obj.artifactId === id ||
              obj.planId === id ||
              obj.signedId === id ||
              obj.txId === id
            ) {
              return obj;
            }
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
      if (!options.json) console.log(`  âœ“ ${relativePath.padEnd(40)} [MATCH]`);
      successCount++;
    } else {
      if (!options.json) {
        console.log(`  âœ— ${relativePath.padEnd(40)} [FAIL]`);
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
    console.log(
      JSON.stringify(
        {
          schema: "hardkas.queryVerify.v1",
          ok: failCount === 0,
          scanned: files.length,
          successCount,
          failCount,
          results: jsonResults
        },
        null,
        2
      )
    );
    if (failCount > 0) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("VERIFICATION_FAILED", "Recursive verification failed.", {
        exitCode: 1
      });
    }
    return;
  }

  console.log("\n" + "â•".repeat(50));
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
