import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function run(cmd) {
  try {
    return execSync(cmd).toString().trim();
  } catch (e) {
    return 'unknown';
  }
}

const rustcVersion = run('rustc --version');
const cargoVersion = run('cargo --version');
const os = process.platform;
const arch = process.arch;

const cargoToml = readFileSync(join(process.cwd(), 'Cargo.toml'), 'utf8');
const revMatch = cargoToml.match(/rev\s*=\s*"([^"]+)"/);
const rustyKaspaCommit = revMatch ? revMatch[1] : 'unknown';

const provenance = {
  buildTime: new Date().toISOString(),
  toolchain: {
    rustc: rustcVersion,
    cargo: cargoVersion,
    os,
    arch
  },
  dependencies: {
    "kaspa-wallet-pskt": {
      repository: "kaspanet/rusty-kaspa",
      commit: rustyKaspaCommit
    }
  }
};

writeFileSync(join(process.cwd(), 'NATIVE_RUNTIME_PROVENANCE.json'), JSON.stringify(provenance, null, 2));
console.log('Provenance generated.');
