import fs from "node:fs";
import path from "node:path";
import { HardkasSchemas } from "@hardkas/artifacts";

const root = process.cwd();
const examples = [
  "silver-vault-policy",
  "silver-escrow-policy",
  "zk-proof-registry",
  "zk-identity-claim-demo",
  "vprogs-artifact-browser",
  "programmability-dashboard",
  "ai-programmability-agent"
];

const missing = [];
for (const example of examples) {
  for (const file of ["README.md", "main.ts"]) {
    const target = path.join(root, "examples", "apps", example, file);
    if (!fs.existsSync(target))
      missing.push(path.relative(root, target).replace(/\\/g, "/"));
  }
}

const result = {
  ok: missing.length === 0,
  schema : HardkasSchemas.ProgrammabilityExamplesCheckV1,
  status:
    missing.length === 0
      ? "PROGRAMMABILITY_APPS_READY"
      : "PROGRAMMABILITY_APPS_INCOMPLETE",
  examplesChecked: examples.length,
  missing
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
