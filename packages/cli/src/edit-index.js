import fs from 'node:fs';

const path = 'd:/Users/javier/aplicaciones kaspa/workspace/Hardkas/packages/cli/src/index.ts';
let content = fs.readFileSync(path, 'utf8');

const txImport = 'import { runL2TxBuild, runL2TxSign } from "./runners/l2-tx-runners.js";\n';

if (content.includes('import { runL2TxBuild }')) {
  content = content.replace('import { runL2TxBuild }', 'import { runL2TxBuild, runL2TxSign }');
} else if (!content.includes('./runners/l2-tx-runners.js')) {
  content = content.replace('import { bigIntReplacer }', txImport + 'import { bigIntReplacer }');
}

const signCommand = `
  l2tx.command("sign <planPath>")
    .description("Sign an L2 EVM transaction plan artifact")
    .option("--account <name>", "Account name or address from the real store")
    .option("--out-dir <dir>", "Output directory for signed transactions", "signed")
    .option("--json", "Output results in JSON format")
    .action(async (planPath, options) => {
      try {
        await runL2TxSign({ planPath, ...options });
      } catch (e) {
        handleError(e);
      }
    });
`;

if (!content.includes('l2tx.command("sign <planPath>")')) {
  content = content.replace('try {', signCommand + '\n    try {');
}

// Fix indentation
content = content.replace('l2tx.command("sign <planPath>")', '\n  l2tx.command("sign <planPath>")');

fs.writeFileSync(path, content, 'utf8');
console.log('CLI updated successfully');
