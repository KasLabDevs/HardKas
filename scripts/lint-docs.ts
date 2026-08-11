import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DOC_PATHS = ["README.md", "docs/book/00-quickstart.md", "docs/index.html"];

interface ForbiddenRule {
  pattern: RegExp;
  suggestion: string;
  allowlist?: RegExp[];
}

const FORBIDDEN_RULES: Record<string, ForbiddenRule> = {
  "node start": {
    pattern: /\bnode start\b/gi,
    suggestion: "Use 'localnet start' instead.",
  },
  "simnet-as-simulator": {
    pattern: /\bsimnet\b/gi,
    suggestion: "Use 'simulator' when referring to the in-memory execution mode. Use 'simnet' ONLY when referring to the Kaspa network used by Localnet.",
    allowlist: [/testnet-simnet/i, /kaspa simnet/i, /default: simnet/i, /network: simnet/i, /on simnet/i, /simnet funding/i, /simnet UTXOs/i, /simnet\/local/i, /Local Devnet \/ Simnet/i, /<code>simnet<\/code>/i, /class="runbook-pill">simnet</i],
  },
  "simulated-as-mode": {
    pattern: /\bsimulated\b/gi,
    suggestion: "Use 'simulator' when referring to the execution mode. Use 'simulated' ONLY when referring to the network type for Simulator.",
    allowlist: [/simulated receipt/i, /simulated trace/i, /simulated test/i, /simulated transaction/i, /simulated spend/i, /is simulated/i, /simulated execution/i, /network: ['"]?simulated['"]?/i, /network simulated/i, /Local-Only \(Simulated\)/i, /<code>simulated<\/code>/i],
  },
  "faucet": {
    pattern: /\bfaucet\b/gi,
    suggestion: "Use 'simulator fund' or 'localnet fund' depending on execution environment.",
  }
};

async function lintFile(filePath: string): Promise<number> {
  let errors = 0;
  try {
    const fullPath = path.resolve(REPO_ROOT, filePath);
    const content = await fs.readFile(fullPath, "utf-8");
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [ruleName, rule] of Object.entries(FORBIDDEN_RULES)) {
        let match;
        // Reset lastIndex because we're using a global regex
        rule.pattern.lastIndex = 0;
        while ((match = rule.pattern.exec(line)) !== null) {
          // Check allowlist
          let isAllowed = false;
          if (rule.allowlist) {
            for (const allowRegex of rule.allowlist) {
              if (allowRegex.test(line)) {
                isAllowed = true;
                break;
              }
            }
          }

          if (!isAllowed) {
            console.error(`[ERROR] ${filePath}:${i + 1} - Found forbidden terminology "${match[0]}" (${ruleName}).`);
            console.error(`        Suggestion: ${rule.suggestion}`);
            console.error(`        Line: ${line.trim()}`);
            errors++;
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`Failed to read file ${filePath}: ${err.message}`);
  }
  return errors;
}

async function main() {
  let totalErrors = 0;
  for (const doc of DOC_PATHS) {
    totalErrors += await lintFile(doc);
  }

  if (totalErrors > 0) {
    console.error(`\nFound ${totalErrors} documentation linting error(s).`);
    process.exit(1);
  } else {
    console.log("Documentation linting passed.");
  }
}

main().catch(console.error);
