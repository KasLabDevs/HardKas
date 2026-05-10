import { verifyArtifactIntegrity, verifyArtifactSemantics } from "@hardkas/artifacts";
import { UI } from "../ui.js";
import path from "node:path";
import fs from "node:fs";

export interface ArtifactVerifyOptions {
  path: string;
  json?: boolean;
  recursive?: boolean;
  strict?: boolean;
}

export async function runArtifactVerify(options: ArtifactVerifyOptions) {
  const absolutePath = path.resolve(process.cwd(), options.path);
  
  if (!fs.existsSync(absolutePath)) {
    UI.error(`Path not found: ${options.path}`);
    process.exitCode = 1;
    return;
  }

  const stats = fs.statSync(absolutePath);
  const isDir = stats.isDirectory();

  if (isDir) {
    if (options.recursive) {
      return runRecursiveVerify(absolutePath, options);
    } else {
      UI.error(`${options.path} is a directory. Use --recursive to verify all artifacts within it.`);
      process.exitCode = 1;
      return;
    }
  }

  // Single file verification
  let result = await verifyArtifactIntegrity(absolutePath);

  const artifact = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  const semanticResult = verifyArtifactSemantics(artifact, { strict: options.strict ?? false });
  
  // Merge semantic issues into result
  result.issues.push(...semanticResult.issues);
  result.errors.push(...semanticResult.errors);
  result.ok = result.ok && semanticResult.ok;

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
      const feeAudit = verifyArtifactSemantics(artifact, { strict: true });
      if (feeAudit.ok) {
        UI.success("  ✓ Economic invariants verified.");
      } else {
        UI.error("  ✗ Economic invariants VIOLATED.");
      }
    }
  } else {
    UI.error("VERIFICATION FAILED");
    renderErrors(result);
    process.exitCode = 1;
  }

  return result;
}

async function runRecursiveVerify(dir: string, options: ArtifactVerifyOptions) {
  const files = getAllJsonFiles(dir);
  UI.header(`Recursive Verification: ${path.basename(dir)}`);
  console.log(`Auditing ${files.length} artifact(s)...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const relativePath = path.relative(dir, file);
    
    // 1. Integrity Check
    const result = await verifyArtifactIntegrity(file);
    
    // 2. Semantic & Lineage Audit
    const artifact = JSON.parse(fs.readFileSync(file, "utf-8"));
    const semanticResult = verifyArtifactSemantics(artifact, { strict: options.strict ?? false });
    
    // Merge results
    result.issues.push(...semanticResult.issues);
    result.errors.push(...semanticResult.errors);
    result.ok = result.ok && semanticResult.ok;

    if (result.ok) {
      console.log(`  ✓ ${relativePath.padEnd(40)} [MATCH]`);
      successCount++;
    } else {
      console.log(`  ✗ ${relativePath.padEnd(40)} [FAIL]`);
      result.issues.forEach(issue => {
        const prefix = issue.severity === "critical" ? "[!!!]" : issue.severity === "error" ? "[!]" : "[?]";
        console.log(`      ${prefix} [${issue.code}] ${issue.message}`);
      });
      failCount++;
    }
  }

  console.log("\n" + "═".repeat(50));
  if (failCount === 0) {
    UI.success(`Audit Complete: All ${successCount} artifacts verified.`);
  } else {
    UI.error(`Audit Failed: ${failCount} artifact(s) corrupted or invalid.`);
    process.exitCode = 1;
  }
}

function getAllJsonFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
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
  if (result.version)      console.log(`  Version: ${result.version}`);
  
  if (result.expectedHash || result.actualHash) {
    console.log(`  Expected Hash: ${result.expectedHash || "None"}`);
    console.log(`  Actual Hash:   ${result.actualHash || "N/A"}`);
  }

  console.log("\nIssues:");
  result.issues.forEach((issue: any) => {
    const prefix = issue.severity === "critical" ? "CRITICAL: " : issue.severity === "error" ? "ERROR:    " : "WARNING:  ";
    console.log(`- ${prefix}[${issue.code}] ${issue.message}`);
  });
}
