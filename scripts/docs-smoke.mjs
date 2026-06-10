import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import * as hardkasSdk from "@hardkas/sdk";

const docsDir = path.join(process.cwd(), "docs");

function extractCodeBlocks(content, lang) {
  const regex = new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\`\`\``, "g");
  const blocks = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function scanDir(dir) {
  let results = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(scanDir(fullPath));
    } else if (fullPath.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

function checkDeepImports(code) {
  const importRegex = /from\s+['"](@hardkas\/[^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const pkg = match[1];
    // Allow @hardkas/sdk, @hardkas/cli, @hardkas/client
    // Reject deep imports like @hardkas/sdk/dist/utils
    if (pkg.split("/").length > 2) {
      throw new Error(`Undocumented deep import detected: ${pkg}`);
    }
  }
}

async function run() {
  console.log("Starting Documentation Smoke Test...");
  const files = scanDir(docsDir);

  let jsBlocks = 0;
  let bashBlocks = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");

    // Check JS/TS blocks
    const js = extractCodeBlocks(content, "javascript").concat(
      extractCodeBlocks(content, "typescript")
    );
    for (const code of js) {
      jsBlocks++;
      checkDeepImports(code);
      // We could eval() or parse the AST here, but for now we ensure imports are clean.
      if (code.includes("Hardkas.create")) {
        if (!hardkasSdk.Hardkas || !hardkasSdk.Hardkas.create) {
          throw new Error("Docs reference Hardkas.create but it is not exported by SDK");
        }
      }
    }

    // Check bash blocks for CLI commands
    const bash = extractCodeBlocks(content, "bash");
    for (const code of bash) {
      bashBlocks++;
      const lines = code.split("\n");
      for (const line of lines) {
        if (line.startsWith("hardkas ")) {
          const args = line.split(" ").slice(1);
          // Just a rudimentary check that the top level command is known
          const knownCommands = [
            "tx",
            "accounts",
            "query",
            "artifact",
            "dev",
            "telemetry",
            "doctor",
            "status",
            "verify-semantics",
            "localnet",
            "init"
          ];
          if (!knownCommands.includes(args[0])) {
            throw new Error(`Unknown CLI command in docs: hardkas ${args[0]} in ${file}`);
          }
        }
      }
    }
  }

  console.log(`Scanned ${files.length} markdown files.`);
  console.log(`Validated ${jsBlocks} JS/TS snippets (Deep imports rejected).`);
  console.log(`Validated ${bashBlocks} Bash snippets.`);
  console.log("Documentation Smoke Test PASSED!");
}

run().catch((e) => {
  console.error("Documentation Smoke Test FAILED!");
  console.error(e.message);
  process.exit(1);
});
