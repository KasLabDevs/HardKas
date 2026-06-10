import fs from 'fs';
import path from 'path';

const hardkasDir = 'C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo';
const outDir = 'C:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/scratch';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function extract() {
  console.log("Extracting CLI help...");
  // I will just read package.json of CLI and SDK, and export structure.
  
  const sdkPkg = JSON.parse(fs.readFileSync(path.join(hardkasDir, 'packages/sdk/package.json'), 'utf8'));
  const cliPkg = JSON.parse(fs.readFileSync(path.join(hardkasDir, 'packages/cli/package.json'), 'utf8'));
  
  // Read core exports
  const corePkg = JSON.parse(fs.readFileSync(path.join(hardkasDir, 'packages/core/package.json'), 'utf8'));
  
  // Save to scratch
  fs.writeFileSync(path.join(outDir, 'repo-meta.json'), JSON.stringify({
    sdk: { exports: sdkPkg.exports },
    cli: { bin: cliPkg.bin },
    core: { exports: corePkg.exports }
  }, null, 2));

  console.log("Done.");
}

extract().catch(console.error);
