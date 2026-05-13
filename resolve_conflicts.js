import fs from "node:fs";
import { execSync } from "node:child_process";

// List all files with conflicts
const output = execSync("git diff --name-only --diff-filter=U", { encoding: "utf8" });
const files = output.trim().split("\n").filter(f => f.length > 0);

console.log(`Found ${files.length} files with conflicts.`);

for (const file of files) {
  console.log(`Resolving ${file}...`);
  const content = fs.readFileSync(file, "utf8");
  
  // Basic conflict resolution: keep HEAD (the part between <<<<<<< HEAD and =======)
  const resolved = content.replace(/<<<<<<< HEAD\r?\n([\s\S]*?)\r?\n=======\r?\n[\s\S]*?\r?\n>>>>>>> .*\r?\n/g, "$1\n")
                           .replace(/<<<<<<< HEAD\r?\n([\s\S]*?)\r?\n=======\r?\n[\s\S]*?\r?\n>>>>>>> .*/g, "$1");
  
  fs.writeFileSync(file, resolved, "utf8");
  execSync(`git add "${file}"`);
}

console.log("All conflicts resolved (HEAD accepted).");
