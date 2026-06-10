import fs from 'node:fs';
import path from 'node:path';

const DIRS = [
  'packages/cli/src/commands',
  'packages/cli/src/runners'
];

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath));
    } else if (file.endsWith('.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

let files = [];
for (const dir of DIRS) {
  files = files.concat(getFiles(dir));
}

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace handleLockError + exit
  content = content.replace(/handleLockError\(([^)]+)\);\s*process\.exitCode\s*=\s*1;/g, 'throw $1;');
  
  // Replace handleError + exit
  content = content.replace(/handleError\(([^)]+)\);\s*process\.exitCode\s*=\s*1;/g, 'throw $1;');

  // Replace stray process.exitCode = 1 inside a catch block if there is a throw before it? No, just replace it with throw new Error.
  // Actually, we'll replace stray `process.exitCode = 1;` with `throw new Error("Command failed");` unless it's already a throw e.
  content = content.replace(/process\.exitCode\s*=\s*1;/g, 'throw new Error("Command failed");');

  // Replace process.exit(1)
  content = content.replace(/process\.exit\(\s*1\s*\);/g, 'throw new Error("Command failed");');
  
  // Replace specific chaos exits
  content = content.replace(/process\.exit\(err\.exitCode\);/g, 'throw err;');
  content = content.replace(/process\.exit\(ChaosExitCodes\.INTERNAL_FAILURE\);/g, 'throw new Error("Chaos Internal Failure");');

  // We won't remove imports because it causes TS errors if handleError was used elsewhere in the file
  fs.writeFileSync(file, content);
}

console.log('Migration complete');

console.log('Migration complete');
