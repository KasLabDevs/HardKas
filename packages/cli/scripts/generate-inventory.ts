import { buildHardkasProgram } from "../src/program.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function generateInventory() {
  const program = buildHardkasProgram({ forDocs: true });
  const inventory = [];

  function walk(cmd, parentName = "") {
    const fullName = parentName ? `${parentName} ${cmd.name()}` : cmd.name();
    
    // We only care about leaf commands or commands with logic
    if (cmd.commands.length === 0 || cmd._actionHandler) {
      // Strip ANSI codes for Markdown
      const desc = cmd.description().replace(/\x1B\[[0-9;]*m/g, "");
      inventory.push({
        command: fullName,
        description: desc,
        aliases: cmd.aliases(),
        options: cmd.options.map(o => o.flags),
      });
    }

    for (const sub of cmd.commands) {
      walk(sub, fullName);
    }
  }

  walk(program);

  let md = "# CLI Command Inventory\n\n";
  md += "| Command | Description | Aliases | Options |\n";
  md += "|:---|:---|:---|:---|\n";

  for (const item of inventory) {
    if (item.command === "hardkas") continue;
    md += `| \`${item.command}\` | ${item.description} | ${item.aliases.join(", ") || "-"} | ${item.options.map(o => `\`${o}\``).join("<br>") || "-"} |\n`;
  }

  const outPath = path.resolve(__dirname, "../../../docs/generated/cli-inventory.md");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
  console.log(`Inventory generated at: ${outPath}`);
}

generateInventory();
