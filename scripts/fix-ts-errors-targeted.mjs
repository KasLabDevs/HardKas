import fs from "node:fs";
import path from "node:path";

const filesToFix = [
  { path: "packages/cli/src/commands/config.ts", line: 88 },
  { path: "packages/cli/src/commands/explain.ts", line: 51 },
  { path: "packages/cli/src/commands/lock.ts", line: 142 },
  { path: "packages/cli/src/commands/query.ts", line: 73 },
  { path: "packages/cli/src/commands/query.ts", line: 188 },
  { path: "packages/cli/src/commands/query.ts", line: 255 },
  { path: "packages/cli/src/commands/rpc.ts", line: 36 },
  { path: "packages/cli/src/commands/tx.ts", line: 521 },
  { path: "packages/cli/src/commands/tx.ts", line: 589 }
];

for (const { path: relPath, line } of filesToFix) {
  const absPath = path.resolve(relPath);
  let content = fs.readFileSync(absPath, "utf8");
  const lines = content.split("\n");

  // line is 1-indexed
  const lineIndex = line - 1;
  if (lines[lineIndex].includes("throw e;")) {
    lines[lineIndex] = lines[lineIndex].replace(
      "throw e;",
      'throw new Error("Command failed");'
    );
    fs.writeFileSync(absPath, lines.join("\n"));
    console.log(`Fixed ${relPath}:${line}`);
  } else {
    console.log(`WARNING: 'throw e;' not found at ${relPath}:${line}`);
    console.log(`Line content: ${lines[lineIndex]}`);
  }
}
