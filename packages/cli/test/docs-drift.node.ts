import fs from "node:fs";
import path from "node:path";
import { buildHardkasProgram } from "../src/program.js";
import { Command } from "commander";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * HardKAS Docs Drift Detector
 * 
 * Scans markdown files for `hardkas ...` command blocks and verifies
 * that the commands exist in the current CLI program.
 */

const program = buildHardkasProgram({ forDocs: true });

function getAllFiles(dir: string, ext: string): string[] {
  let res: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const p = path.join(dir, file);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (file === "node_modules" || file === ".git") continue;
      res = res.concat(getAllFiles(p, ext));
    } else if (file.endsWith(ext)) {
      res.push(p);
    }
  }
  return res;
}

function extractCommands(content: string): string[] {
  // Look for `hardkas ...` in code blocks or inline backticks
  const regex = /`hardkas\s+([^`]+)`/g;
  const matches = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push(match[1]!.trim());
  }
  
  // Also check for bash/text code blocks
  const blockRegex = /```(?:bash|text|shell)\n([\s\S]+?)\n```/g;
  while ((match = blockRegex.exec(content)) !== null) {
    const lines = match[1]!.split("\n");
    for (const line of lines) {
      if (line.trim().startsWith("hardkas ")) {
        matches.push(line.trim().replace(/^hardkas\s+/, ""));
      }
    }
  }
  
  return matches;
}

function verifyCommand(fullCmd: string): { ok: boolean; error?: string } {
  // Remove flags for base command check
  const parts = fullCmd.split(/\s+/).filter(p => !p.startsWith("-"));
  if (parts.length === 0) return { ok: true }; // just 'hardkas'

  let current: Command | undefined = program;
  for (const part of parts) {
    // Some parts might be arguments <path>, so we stop if we can't find a sub-command
    const sub = current.commands.find(c => c.name() === part || c.aliases().includes(part));
    if (!sub) {
      // If not a subcommand, check if it's an argument placeholder
      if (part.startsWith("<") || part.startsWith("[")) break;
      // It might be a parameter value (e.g. 'alice' in 'accounts fund alice')
      // We heuristic: if current command has arguments, assume it's one
      if ((current as any)._args && (current as any)._args.length > 0) break;
      
      return { ok: false, error: `Command part "${part}" not found in "${current.name()}" hierarchy` };
    }
    current = sub;
  }
  
  return { ok: true };
}

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

const docsFiles = [
  path.join(WORKSPACE_ROOT, "README.md"),
  ...getAllFiles(path.join(WORKSPACE_ROOT, "docs"), ".md")
];

let totalMatches = 0;
let driftCount = 0;

console.log("--- HardKAS Docs Drift Detector ---");

for (const file of docsFiles) {
  const content = fs.readFileSync(file, "utf8");
  const commands = extractCommands(content);
  
  if (commands.length > 0) {
    console.log(`\n📄 ${file}:`);
    for (const cmd of commands) {
      totalMatches++;
      const res = verifyCommand(cmd);
      if (res.ok) {
        // console.log(`  ✅ hardkas ${cmd}`);
      } else {
        driftCount++;
        console.log(`  ❌ hardkas ${cmd} --> ${res.error}`);
      }
    }
  }
}

console.log(`\nSummary: ${totalMatches} commands checked, ${driftCount} drifts found.`);

if (driftCount > 0) {
  process.exit(1);
} else {
  console.log("No drift detected. Documentation is aligned with CLI program.");
}
