import fs from "node:fs";
import path from "node:path";

function walkAndFix(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (["node_modules", "dist", ".git", ".turbo", "build"].includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkAndFix(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      let content = fs.readFileSync(fullPath, "utf8");

      const original = content;

      content = content.replace(/\b(e|err)\.message\b/g, "(($1 instanceof Error) ? $1.message : String($1))");
      content = content.replace(/\b(e|err)\.code\b/g, "(($1 as any).code)");
      content = content.replace(/\b(e|err)\.name\b/g, "(($1 as any).name)");
      content = content.replace(/\b(e|err)\.stack\b/g, "(($1 as any).stack)");
      content = content.replace(/\b(e|err)\.stdout\b/g, "(($1 as any).stdout)");
      content = content.replace(/\b(e|err)\.stderr\b/g, "(($1 as any).stderr)");

      if (original !== content) {
        fs.writeFileSync(fullPath, content, "utf8");
        console.log(`Fixed ${fullPath}`);
      }
    }
  }
}

walkAndFix(path.join(process.cwd(), "packages"));
console.log("Finished fixing TS unknown errors.");
