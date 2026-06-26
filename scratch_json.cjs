const fs = require('fs');
const files = ['init.ts', 'run.ts', 'test.ts', 'dev-server.ts', 'node.ts', 'session.ts', 'config.ts'];
for (const file of files) {
  const path = 'packages/cli/src/commands/' + file;
  let content = fs.readFileSync(path, 'utf8');
  let replaced = false;
  content = content.replace(/(\.option\([^\)]*\))?\s*\.action\(/g, (match, prevOption) => {
    if (prevOption && prevOption.includes('--json')) return match;
    replaced = true;
    return (prevOption ? prevOption : '') + '\n    .option("--json", "Output results as JSON", false)\n    .action(';
  });
  if (replaced) {
    fs.writeFileSync(path, content, 'utf8');
    console.log('Updated ' + file);
  }
}
