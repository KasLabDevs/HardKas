import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { fileURLToPath } from "node:url";

const REPO_ROOT = process.cwd();
const BOOK_DIR = path.join(REPO_ROOT, "docs", "book");
const TMP_DIR = path.join(REPO_ROOT, ".tmp", "docs-verify");

// Ensures `hardkas` command works inside the snippets
const env = {
  ...process.env,
  JITI_CACHE: "false",
  PATH: `${path.join(REPO_ROOT, "node_modules", ".bin")}${path.delimiter}${process.env.PATH}`
};

function extractExecuteBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /```bash\s+execute[\s\S]*?```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const block = match[0];
    // Remove the ```bash execute and ``` parts
    const code = block.replace(/```bash\s+execute[^\n]*\n/, "").replace(/```$/, "").trim();
    blocks.push(code);
  }
  return blocks;
}

function main() {
  if (!fs.existsSync(BOOK_DIR)) {
    console.error(`[Docs Verify] Directory not found: ${BOOK_DIR}`);
    process.exit(1);
  }

  // Find all .md files in docs/book and sort them
  const files = fs.readdirSync(BOOK_DIR)
    .filter(f => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log("[Docs Verify] No markdown files found.");
    return;
  }

  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  let totalFiles = 0;
  let totalBlocks = 0;

  for (const file of files) {
    console.log(`\n=== Verifying ${file} ===`);
    const filePath = path.join(BOOK_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const blocks = extractExecuteBlocks(content);

    if (blocks.length === 0) {
      console.log(`  (No executable blocks found)`);
      continue;
    }

    // Isolate workspace per chapter
    const chapterName = file.replace(".md", "");
    const chapterTmpDir = path.join(TMP_DIR, chapterName);
    fs.mkdirSync(chapterTmpDir, { recursive: true });

    let blockIndex = 1;
    for (const code of blocks) {
      console.log(`\n  --- Executing block ${blockIndex}/${blocks.length} ---`);
      console.log(code.split("\n").map(l => `  > ${l}`).join("\n"));
      console.log(`  -----------------------------------`);

      // Parse the code line by line to handle 'cat << EOF > file'
      const lines = code.replace(/\r\n/g, "\n").split("\n");
      let inHeredoc = false;
      let heredocFile = "";
      let heredocContent: string[] = [];
      let commandsToRun: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!inHeredoc) {
          const match = line.match(/^cat\s+<<\s+['"]?EOF['"]?\s+>\s+([^\s]+)/);
          if (match) {
            inHeredoc = true;
            heredocFile = match[1];
            heredocContent = [];
          } else {
            if (line.trim() !== "") {
              commandsToRun.push(line);
            }
          }
        } else {
          if (line.trim() === "EOF") {
            inHeredoc = false;
            // Write the extracted heredoc file
            const destPath = path.join(chapterTmpDir, heredocFile);
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.writeFileSync(destPath, heredocContent.join("\n"));
            console.log(`  [Emulated] Wrote ${heredocFile} (${heredocContent.length} lines)`);
          } else {
            heredocContent.push(line);
          }
        }
      }

      try {
        if (commandsToRun.length > 0) {
          const joinedCmd = commandsToRun.join(" && ");
          console.log(`  [Running] ${joinedCmd}`);
          const output = execSync(joinedCmd, {
            cwd: chapterTmpDir,
            env,
            stdio: "pipe",
            encoding: "utf-8"
          });
          if (output.trim().length > 0) {
             console.log(output.split("\n").map(l => `    ${l}`).join("\n"));
          }
        }
        console.log(`  [OK] Block ${blockIndex} passed.`);
      } catch (err: any) {
        console.error(`\n[ERROR] Block ${blockIndex} in ${file} failed!`);
        if (err.stdout) console.error("STDOUT:\n" + err.stdout);
        if (err.stderr) console.error("STDERR:\n" + err.stderr);
        console.error(`\nFAILED CODE:\n${code}\n`);
        process.exit(1);
      }
      blockIndex++;
      totalBlocks++;
    }
    totalFiles++;
  }

  console.log(`\n[Docs Verify] SUCCESS: Verified ${totalBlocks} executable blocks across ${totalFiles} chapters.`);
}

main();
