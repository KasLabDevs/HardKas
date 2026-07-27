import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const rootMdFiles = [
  "README.md",
  "RUNTIME_CONTRACT.md",
  "RUNTIME_SEMANTICS.md",
  "SECURITY.md",
  "CONTRIBUTING.md"
]
  .map((f) => path.join(projectRoot, f))
  .filter((f) => fs.existsSync(f));

function getDocsFiles(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  fs.readdirSync(dir).forEach((file) => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = getDocsFiles(dirFile, filelist);
    } else {
      if (file.endsWith(".md")) {
        filelist.push(dirFile);
      }
    }
  });
  return filelist;
}

const mdFiles = [...rootMdFiles, ...getDocsFiles(path.join(projectRoot, "docs"))];
let hasErrors = false;

// Current valid version
const CURRENT_VERSION = "0.11.4-alpha";

for (const file of mdFiles) {
  const content = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);

  // Check old versions (e.g. 0.7.x, 0.8.x)
  const oldVersionMatches = content.match(/0\.(?:6|7|8)(?:\.\d+)?-alpha/g);
  if (oldVersionMatches) {
    console.error(
      `\u274c [${path.relative(projectRoot, file)}] Contains old version reference: ${oldVersionMatches[0]}`
    );
    hasErrors = true;
  }

  // Check local links [text](path/to/file)
  const linkRegex = /\[[^\]]+\]\(([^)http#\s]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const linkPath = match[1];

    // Ignore external URLs and purely hash links
    if (
      linkPath.startsWith("http") ||
      linkPath.startsWith("#") ||
      linkPath.startsWith("mailto:")
    )
      continue;

    // Ignore markdown file:/// links from AI
    if (linkPath.startsWith("file://")) continue;

    // clean query or hash from path
    const cleanPath = linkPath.split("#")[0].split("?")[0];
    if (!cleanPath) continue;

    const targetPath = path.resolve(dir, cleanPath);
    if (!fs.existsSync(targetPath)) {
      console.error(
        `\u274c [${path.relative(projectRoot, file)}] Broken link: ${linkPath}`
      );
      hasErrors = true;
    }
  }
}

if (hasErrors) {
  console.error("\ndocs:check FAILED!");
  process.exit(1);
} else {
  console.log(
    "\n\u2705 docs:check PASSED! All links are valid and no old versions found."
  );
}
