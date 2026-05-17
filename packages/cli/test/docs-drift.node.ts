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

function findOption(cmd: Command, name: string): any {
  let c: Command | null = cmd;
  while (c) {
    const opt = c.options.find(o => o.short === name || o.long === name);
    if (opt) return opt;
    c = c.parent;
  }
  return null;
}

function verifyCommand(fullCmd: string): { ok: boolean; error?: string } {
  const tokens = fullCmd.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return { ok: true };

  let current: Command = program;
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i]!;

    // 1. If it starts with "-", it is an option/flag
    if (token.startsWith("-")) {
      const optionName = token.split("=")[0]!;
      const opt = findOption(current, optionName);
      if (opt) {
        if (opt.required || opt.optional) {
          if (!token.includes("=") && i + 1 < tokens.length && !tokens[i + 1]!.startsWith("-")) {
            i++; // skip option value
          }
        }
      } else {
        // Fallback: if not registered but next token looks like a value, skip it
        if (i + 1 < tokens.length && !tokens[i + 1]!.startsWith("-")) {
          i++;
        }
      }
      i++;
      continue;
    }

    // 2. If it's a subcommand of the current command
    const sub = current.commands.find(c => c.name() === token || c.aliases().includes(token));
    if (sub) {
      current = sub;
      i++;
      continue;
    }

    // 3. If it's an argument placeholder (like <name> or [path])
    if (token.startsWith("<") || token.startsWith("[")) {
      i++;
      continue;
    }

    // 4. If current command accepts positional arguments, consume it
    if ((current as any)._args && (current as any)._args.length > 0) {
      i++;
      continue;
    }

    // 5. Otherwise, it is an unrecognized part / drift
    return { ok: false, error: `Command part "${token}" not found in "${current.name()}" hierarchy` };
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
