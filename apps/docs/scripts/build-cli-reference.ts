import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, "../docs/reference/cli");
const dataDir = path.resolve(__dirname, "../docs-data");

// Create target directory if it doesn't exist
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Load inventory and semantics
const inventory = JSON.parse(fs.readFileSync(path.join(dataDir, "cli-command-inventory.json"), "utf8"));
// We can dynamically import the TS file, or since we are running via tsx, we can import it.
import { cliSemantics } from "../docs-data/cli-semantics.js";

// Group commands by category (first word after 'hardkas')
const groups: Record<string, any[]> = {};
for (const cmd of inventory) {
  const parts = cmd.commandPath.split(" ");
  let group = "misc";
  if (parts.length > 1) {
    group = parts[1];
  }
  if (!groups[group]) groups[group] = [];
  groups[group].push(cmd);
}

// Write the index page
const indexContent = `---
title: CLI Reference
sidebar_position: 1
---

# HardKAS CLI Reference

Welcome to the definitive structural and semantic reference for the HardKAS command-line interface.

## Map of the CLI

The CLI is organized into strict functional domains. 

${Object.keys(groups).sort().map(group => `- [hardkas ${group}](./${group}.md)`).join("\n")}

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
`;

fs.writeFileSync(path.join(docsDir, "index.md"), indexContent);

// Write individual group pages
function sanitizeMdx(str: string): string {
  if (!str) return "";
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
}

for (const [group, commands] of Object.entries(groups)) {
  let md = `---
title: hardkas ${group}
---

# \`hardkas ${group}\`

`;

  for (const cmd of commands) {
    const semantics = cliSemantics[cmd.commandPath] || {};
    const isDisabled = semantics.limitations?.some(l => l.startsWith("DISABLED"));
    
    md += `## \`${cmd.commandPath}\`\n\n`;
    
    if (isDisabled) {
        md += `> **⚠️ DISABLED:** ${semantics.limitations?.find(l => l.startsWith("DISABLED"))?.replace("DISABLED: ", "")}\n\n`;
    }

    md += `### Synopsis (Generated)\n\n`;
    md += `**Purpose:** ${sanitizeMdx(cmd.description)}\n\n`;
    
    if (cmd.aliases && cmd.aliases.length > 0) {
      md += `**Aliases:** ${cmd.aliases.map((a: string) => `\`${a}\``).join(", ")}\n\n`;
    }

    if (cmd.arguments && cmd.arguments.length > 0) {
      md += `#### Arguments\n\n`;
      cmd.arguments.forEach((a: any) => {
        md += `- \`&lt;${sanitizeMdx(a.name)}&gt;\` ${a.required ? "(Required)" : "(Optional)"}: ${sanitizeMdx(a.description)}\n`;
      });
      md += `\n`;
    }

    if (cmd.options && cmd.options.length > 0) {
      md += `#### Options\n\n`;
      cmd.options.forEach((o: any) => {
        const def = o.defaultValue !== undefined ? ` (Default: \`${sanitizeMdx(String(o.defaultValue))}\`)` : "";
        md += `- \`${sanitizeMdx(o.flags)}\`${def}: ${sanitizeMdx(o.description)}\n`;
      });
      md += `\n`;
    }

    // Semantic Section
    const hasSemantics = Object.keys(semantics).length > 1; // more than just commandPath
    if (hasSemantics) {
        md += `### Semantic Contract (Curated)\n\n`;

        if (semantics.environments) {
            md += `- **Environments:** ${semantics.environments.join(", ")}\n`;
        }
        if (semantics.reads) {
            md += `- **Reads:** ${semantics.reads.join(", ")}\n`;
        }
        if (semantics.writes) {
            md += `- **Writes:** ${semantics.writes.join(", ")}\n`;
        }
        if (semantics.artifactsProduced) {
            md += `- **Produces:** ${semantics.artifactsProduced.join(", ")}\n`;
        }
        if (semantics.acceptedIdentifiers) {
            md += `- **Accepted Identifiers:** ${semantics.acceptedIdentifiers.map(i => `\`${i}\``).join(", ")}\n`;
        }
        if (semantics.sideEffects && semantics.sideEffects.length > 0) {
            md += `- **⚠️ Side Effects:** ${semantics.sideEffects.join(" ")}\n`;
        }
        if (semantics.evidenceMeaning) {
            md += `- **Evidence Semantics:** ${semantics.evidenceMeaning}\n`;
        }
        if (semantics.plannerPath) {
            md += `- **Planner Path:** ${semantics.plannerPath}\n`;
        }
        md += `\n`;

        if (semantics.limitations && semantics.limitations.length > 0) {
            md += `#### Known Limitations\n`;
            semantics.limitations.forEach(l => {
                if (!l.startsWith("DISABLED")) {
                    md += `- ${l}\n`;
                }
            });
            md += `\n`;
        }

        if ((semantics.relatedConcepts && semantics.relatedConcepts.length > 0) || (semantics.relatedGuides && semantics.relatedGuides.length > 0)) {
            md += `#### Related\n`;
            semantics.relatedConcepts?.forEach(r => md += `- Concept: ${r}\n`);
            semantics.relatedGuides?.forEach(r => md += `- Guide: ${r}\n`);
            md += `\n`;
        }
    }
    
    md += `---\n\n`;
  }

  fs.writeFileSync(path.join(docsDir, `${group}.md`), md);
}

console.log("CLI Reference generated successfully.");
