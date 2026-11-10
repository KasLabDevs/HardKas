// INT9 · D4: the CLI pages of apps/docs (docs/reference/cli/*.md) and their inventory (docs-data/cli-command-inventory.json)
// come from the Commander tree of packages/cli/src, as docs/reference/cli.md does (pnpm docs:generate-cli). This one
// script both writes them and checks them, so no gate can pass while they drift:
//   pnpm docs:generate-apps-cli   (tsx apps/docs/scripts/cli-reference.mts --write)
//   pnpm docs:check-apps-cli      (tsx apps/docs/scripts/cli-reference.mts --check)
// It replaces apps/docs/scripts/extract-cli.ts + build-cli-reference.ts and packages/cli/scripts/extract-cli.ts, which
// were run by hand and nothing checked. The output format is theirs, unchanged. Every .md file of docs/reference/cli is
// generated: one the tree no longer produces is stale (removed by --write, reported by --check).
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command } from "commander";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const DOCS_DIR = path.resolve(here, "../docs/reference/cli");
const INVENTORY = path.resolve(here, "../docs-data/cli-command-inventory.json");

interface InventoryEntry {
  commandPath: string;
  description: string;
  arguments: Array<{ name: string; required: boolean; description?: string }>;
  options: Array<{ flags: string; description?: string; defaultValue?: unknown }>;
  aliases: string[];
  category: string;
  status: "REGISTERED";
}

type Semantics = Record<string, any>;

async function loadProgram(): Promise<Command> {
  const mod = await import(pathToFileURL(path.join(ROOT, "packages", "cli", "src", "program.ts")).href);
  return mod.buildHardkasProgram({ forDocs: true });
}

async function loadSemantics(): Promise<Semantics> {
  const mod: any = await import(pathToFileURL(path.resolve(here, "../docs-data/cli-semantics.ts")).href);
  return mod.cliSemantics ?? mod.default?.cliSemantics ?? {};
}

export function extractInventory(program: Command): InventoryEntry[] {
  const inventory: InventoryEntry[] = [];
  function walk(cmd: Command, parentName = "") {
    // SURFACE-TRUTH-1B (ST-I5): hidden means not documented as usable; a hidden command and its subcommands are left out.
    if ((cmd as any)._hidden) return;
    const fullName = parentName ? `${parentName} ${cmd.name()}` : cmd.name();
    if (fullName !== "hardkas" && (cmd.commands.length === 0 || (cmd as any)._actionHandler)) {
      const parts = fullName.split(" ");
      inventory.push({
        commandPath: fullName,
        description: cmd.description().replace(/\x1B\[[0-9;]*m/g, ""),
        arguments: (cmd as any)._args.map((a: any) => ({ name: a._name, required: a.required, description: a.description })),
        options: cmd.options.map((o: any) => ({ flags: o.flags, description: o.description, defaultValue: o.defaultValue })),
        aliases: cmd.aliases(),
        category: parts.length > 1 ? parts[1]!.charAt(0).toUpperCase() + parts[1]!.slice(1) : "Misc",
        status: "REGISTERED"
      });
    }
    for (const sub of cmd.commands) walk(sub as Command, fullName);
  }
  walk(program);
  return inventory;
}

function sanitizeMdx(str: string | undefined): string {
  if (!str) return "";
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

/** file name (in docs/reference/cli) -> content. */
export function renderCliReference(inventory: InventoryEntry[], cliSemantics: Semantics): Map<string, string> {
  const files = new Map<string, string>();
  const groups: Record<string, InventoryEntry[]> = {};
  for (const cmd of inventory) {
    const parts = cmd.commandPath.split(" ");
    const group = parts.length > 1 ? parts[1]! : "misc";
    (groups[group] ??= []).push(cmd);
  }

  files.set(
    "index.md",
    `---
title: CLI Reference
sidebar_position: 1
---

# HardKAS CLI Reference

Welcome to the definitive structural and semantic reference for the HardKAS command-line interface.

## Map of the CLI

The CLI is organized into strict functional domains.

${Object.keys(groups)
  .sort()
  .map((group) => `- [hardkas ${group}](./${group}.md)`)
  .join("\n")}

## How to read this reference

Every command page is divided into two distinct boundaries to prevent drift:
1. **Generated Structural Reference**: Automatically extracted from the Commander AST (Arguments, Options, Defaults).
2. **Curated Semantic Metadata**: Editorial boundaries curated to explain Evidence, Side Effects, and Identity Contracts.

### Artifact Handles (Identity Contract)
When a command accepts an artifact identifier (e.g. \`hardkas explain <artifact>\`), you must provide either:
1. An explicit **filepath** (e.g., \`./.hardkas/artifacts/plans/my-plan.json\`)
2. The exact canonical **artifactId** (a 64-character hex string)

Do **not** use the network \`txId\` as a generic locator. It will fail.

### Side Effect Notation
Commands that mutate your local workspace, broadcast to a network, or expose sensitive material (like private keys) are explicitly marked in the **Side Effects** semantic block. If a command does not have this block, it is considered a read-only operation.
`
  );

  for (const [group, commands] of Object.entries(groups)) {
    let md = `---
title: hardkas ${group}
---

# \`hardkas ${group}\`

`;
    for (const cmd of commands) {
      const semantics = cliSemantics[cmd.commandPath] || {};
      const isDisabled = semantics.limitations?.some((l: string) => l.startsWith("DISABLED"));
      md += `## \`${cmd.commandPath}\`\n\n`;
      if (isDisabled) {
        md += `> **⚠️ DISABLED:** ${semantics.limitations?.find((l: string) => l.startsWith("DISABLED"))?.replace("DISABLED: ", "")}\n\n`;
      }
      md += `### Synopsis (Generated)\n\n`;
      md += `**Purpose:** ${sanitizeMdx(cmd.description)}\n\n`;
      if (cmd.aliases && cmd.aliases.length > 0) md += `**Aliases:** ${cmd.aliases.map((a) => `\`${a}\``).join(", ")}\n\n`;
      if (cmd.arguments && cmd.arguments.length > 0) {
        md += `#### Arguments\n\n`;
        for (const a of cmd.arguments) {
          md += `- \`&lt;${sanitizeMdx(a.name)}&gt;\` ${a.required ? "(Required)" : "(Optional)"}: ${sanitizeMdx(a.description)}\n`;
        }
        md += `\n`;
      }
      if (cmd.options && cmd.options.length > 0) {
        md += `#### Options\n\n`;
        for (const o of cmd.options) {
          const def = o.defaultValue !== undefined ? ` (Default: \`${sanitizeMdx(String(o.defaultValue))}\`)` : "";
          md += `- \`${sanitizeMdx(o.flags)}\`${def}: ${sanitizeMdx(o.description)}\n`;
        }
        md += `\n`;
      }
      const hasSemantics = Object.keys(semantics).length > 1; // more than just commandPath
      if (hasSemantics) {
        md += `### Semantic Contract (Curated)\n\n`;
        if (semantics.environments) md += `- **Environments:** ${semantics.environments.join(", ")}\n`;
        if (semantics.reads) md += `- **Reads:** ${semantics.reads.join(", ")}\n`;
        if (semantics.writes) md += `- **Writes:** ${semantics.writes.join(", ")}\n`;
        if (semantics.artifactsProduced) md += `- **Produces:** ${semantics.artifactsProduced.join(", ")}\n`;
        if (semantics.acceptedIdentifiers) md += `- **Accepted Identifiers:** ${semantics.acceptedIdentifiers.map((i: string) => `\`${i}\``).join(", ")}\n`;
        if (semantics.sideEffects && semantics.sideEffects.length > 0) md += `- **⚠️ Side Effects:** ${semantics.sideEffects.join(" ")}\n`;
        if (semantics.evidenceMeaning) md += `- **Evidence Semantics:** ${semantics.evidenceMeaning}\n`;
        if (semantics.plannerPath) md += `- **Planner Path:** ${semantics.plannerPath}\n`;
        md += `\n`;
        if (semantics.limitations && semantics.limitations.length > 0) {
          md += `#### Known Limitations\n`;
          for (const l of semantics.limitations) if (!l.startsWith("DISABLED")) md += `- ${l}\n`;
          md += `\n`;
        }
        if ((semantics.relatedConcepts && semantics.relatedConcepts.length > 0) || (semantics.relatedGuides && semantics.relatedGuides.length > 0)) {
          md += `#### Related\n`;
          semantics.relatedConcepts?.forEach((r: string) => (md += `- Concept: ${r}\n`));
          semantics.relatedGuides?.forEach((r: string) => (md += `- Guide: ${r}\n`));
          md += `\n`;
        }
      }
      md += `---\n\n`;
    }
    files.set(`${group}.md`, md);
  }
  return files;
}

const normalize = (s: string) => s.replace(/\r\n/g, "\n");

async function main() {
  const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : undefined;
  if (!mode) {
    console.error("usage: tsx apps/docs/scripts/cli-reference.mts --write | --check");
    process.exit(2);
  }
  const inventory = extractInventory(await loadProgram());
  const inventoryText = JSON.stringify(inventory, null, 2);
  const pages = renderCliReference(inventory, await loadSemantics());
  const existing = fs.existsSync(DOCS_DIR) ? fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md")) : [];
  const stale = existing.filter((f) => !pages.has(f)).sort();

  if (mode === "write") {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(INVENTORY, inventoryText);
    for (const [file, content] of pages) fs.writeFileSync(path.join(DOCS_DIR, file), content);
    for (const f of stale) fs.rmSync(path.join(DOCS_DIR, f));
    console.log(`Wrote ${path.relative(ROOT, INVENTORY)} (${inventory.length} commands) and ${pages.size} pages in ${path.relative(ROOT, DOCS_DIR)}${stale.length ? `; removed ${stale.join(", ")}` : ""}.`);
    return;
  }

  const drift: string[] = [];
  if (!fs.existsSync(INVENTORY) || normalize(fs.readFileSync(INVENTORY, "utf8")) !== inventoryText) drift.push(path.relative(ROOT, INVENTORY));
  for (const [file, content] of pages) {
    const at = path.join(DOCS_DIR, file);
    if (!fs.existsSync(at)) drift.push(`${path.relative(ROOT, at)} (missing)`);
    else if (normalize(fs.readFileSync(at, "utf8")) !== content) drift.push(path.relative(ROOT, at));
  }
  for (const f of stale) drift.push(`${path.relative(ROOT, path.join(DOCS_DIR, f))} (no longer generated)`);
  if (drift.length) {
    console.error(`[!] The apps/docs CLI pages are OUT OF DATE (${drift.length}):`);
    for (const d of drift) console.error(`    ${d}`);
    console.error("    Run 'pnpm docs:generate-apps-cli' to update them.");
    process.exit(1);
  }
  console.log(`✓ The apps/docs CLI pages match the command tree (${inventory.length} commands, ${pages.size} pages).`);
}

await main();
