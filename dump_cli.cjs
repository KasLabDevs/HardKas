const fs = require('fs');
const { execSync } = require('child_process');

const groups = [
  'init', 'doctor', 'capabilities', 'accounts', 'localnet', 'tx', 
  'artifacts', 'artifact', 'query', 'query store', 'security', 
  'programmability', 'zk', 'vprogs', 'silver', 'l2', 'stable-asset', 
  'dev-server', 'node', 'simulator', 'session', 'config', 'run', 
  'create', 'templates', 'test', 'replay', 'scenario', 'evidence'
];

const results = {};

for (const group of groups) {
  try {
    const out = execSync(`npx tsx packages/cli/src/index.ts ${group} --help`, { stdio: 'pipe' }).toString();
    results[group] = { exists: true, output: out };
  } catch (err) {
    results[group] = { exists: false, error: err.message, output: err.stdout ? err.stdout.toString() : err.stderr ? err.stderr.toString() : '' };
  }
}

fs.writeFileSync('cli_help_dumps.json', JSON.stringify(results, null, 2));
