import { buildHardkasProgram } from "C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/cli/src/program.ts";
import { extractCliReference } from "C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/cli/src/docs/generator.ts";
import fs from "node:fs";
const ref = extractCliReference(buildHardkasProgram({ forDocs: true }), { deterministic: true });
fs.writeFileSync("C:/Users/jrodr/AppData/Local/Temp/claude/audit-compare/cli.json", JSON.stringify(ref, null, 2));
console.log("ok", ref.commands.length);
