const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const tsx = 'npx tsx';
const cli = path.resolve('packages/cli/src/index.ts');

try {
  fs.writeFileSync('plan-dummy.json', JSON.stringify({ planId: "test-plan" }));
  console.log(execSync(`${tsx} ${cli} pskt export --plan plan-dummy.json --adapter test-fake-adapter --out test-session-0.json --json`).toString());
  console.log(execSync(`${tsx} ${cli} pskt inspect test-session-0.json --json`).toString());
} catch (e) {
  console.log('STDOUT', e.stdout?.toString());
  console.log('STDERR', e.stderr?.toString());
}
