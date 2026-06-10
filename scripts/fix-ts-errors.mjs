import fs from "node:fs";
import path from "node:path";

const DIRS = ["packages/cli/src/commands", "packages/cli/src/runners"];

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath));
    } else if (file.endsWith(".ts")) {
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
  let content = fs.readFileSync(file, "utf8");
  let original = content;

  // Fix 1: Left side of comma operator (throw e, "Message"; -> throw new Error("Message");)
  content = content.replace(/throw e, "([^"]+)";/g, 'throw new Error("$1");');
  content = content.replace(/throw err, "([^"]+)";/g, 'throw new Error("$1");');

  // Fix 2: 'e' is not defined (throw e; -> throw new Error("Command failed");)
  // ONLY if it is a stray throw e; outside of a catch block
  // But regex for "outside of catch" is hard. Let's just fix the files we know:
  if (content.includes("throw e;")) {
    // If the file does NOT have `catch (e)` or `catch(e)`, it's definitely a stray `e`.
    if (!content.includes("catch (e)") && !content.includes("catch(e)")) {
      content = content.replace(/throw e;/g, 'throw new Error("Command failed");');
    }
  }

  // Fix 3: handleError is missing.
  if (
    content.includes("handleError(") &&
    !content.includes("import { handleError }") &&
    !content.includes("import { UI, handleError }") &&
    !content.includes("import { handleError, UI }")
  ) {
    // If it imports UI from "../ui.js", we can change it to import { UI, handleError }
    if (content.includes('import { UI } from "../ui.js";')) {
      content = content.replace(
        'import { UI } from "../ui.js";',
        'import { UI, handleError } from "../ui.js";'
      );
    } else if (content.includes('import { UI } from "../../ui.js";')) {
      content = content.replace(
        'import { UI } from "../../ui.js";',
        'import { UI, handleError } from "../../ui.js";'
      );
    } else {
      // Just prepend it. We need to figure out depth
      let depth = file.includes("commands/query") ? "../../ui.js" : "../ui.js";
      if (file.includes("runners")) depth = "../ui.js";
      content = `import { handleError } from "${depth}";\n` + content;
    }
  }

  // Fix 4: handleLockError is missing.
  if (content.includes("handleLockError(") && !content.includes("handleLockError }")) {
    if (content.includes('import { UI, handleError } from "../ui.js";')) {
      content = content.replace(
        'import { UI, handleError } from "../ui.js";',
        'import { UI, handleError, handleLockError } from "../ui.js";'
      );
    } else if (content.includes('import { handleError } from "../ui.js";')) {
      content = content.replace(
        'import { handleError } from "../ui.js";',
        'import { handleError, handleLockError } from "../ui.js";'
      );
    } else {
      content = `import { handleLockError } from "../ui.js";\n` + content;
    }
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
  }
}

console.log("Fixed TypeScript compilation errors");
