import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templates = [
  "silver-policy-app",
  "zk-fixture-app",
  "vprogs-inspect-app",
  "full-lab-app"
];

const missing = [];
for (const template of templates) {
  for (const file of ["README.md", "main.ts"]) {
    const target = path.join(root, "templates", "programmability", template, file);
    if (!fs.existsSync(target))
      missing.push(path.relative(root, target).replace(/\\/g, "/"));
  }
}

const result = {
  ok: missing.length === 0,
  schema: "hardkas.programmability.templatesCheck.v1",
  status:
    missing.length === 0
      ? "PROGRAMMABILITY_TEMPLATES_READY"
      : "PROGRAMMABILITY_TEMPLATES_INCOMPLETE",
  templatesChecked: templates.length,
  missing
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
