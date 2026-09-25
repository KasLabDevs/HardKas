import { buildHardkasProgram } from "../src/program.js";
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractInventory() {
  const program = buildHardkasProgram({ forDocs: true });
  const inventory: any[] = [];

  function walk(cmd: Command, parentName = "") {
    const fullName = parentName ? `${parentName} ${cmd.name()}` : cmd.name();

    if (fullName !== "hardkas" && (cmd.commands.length === 0 || (cmd as any)._actionHandler)) {
      const desc = cmd.description().replace(/\x1B\[[0-9;]*m/g, "");
      
      const args = (cmd as any)._args.map((a: any) => ({
        name: a._name,
        required: a.required,
        description: a.description
      }));
      
      const options = cmd.options.map((o: any) => ({
        flags: o.flags,
        description: o.description,
        defaultValue: o.defaultValue
      }));

      const parts = fullName.split(" ");
      let category = "Misc";
      if (parts.length > 2) {
        category = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      } else if (parts.length === 2) {
        category = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      }

      inventory.push({
        commandPath: fullName,
        description: desc,
        arguments: args,
        options: options,
        aliases: cmd.aliases(),
        category: category,
        status: "REGISTERED"
      });
    }

    for (const sub of cmd.commands) {
      walk(sub as Command, fullName);
    }
  }

  walk(program);
  return inventory;
}

const outDir = path.resolve(__dirname, "../../../apps/docs/docs-data");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const inventory = extractInventory();
fs.writeFileSync(path.join(outDir, "cli-command-inventory.json"), JSON.stringify(inventory, null, 2));
console.log("Wrote cli-command-inventory.json");
