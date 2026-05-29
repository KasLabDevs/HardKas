const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function getCommands(helpOutput) {
  const lines = helpOutput.split('\n');
  const commands = [];
  let parsingCommands = false;

  for (const line of lines) {
    if (line.trim().startsWith('Commands:')) {
      parsingCommands = true;
      continue;
    }
    
    if (parsingCommands) {
      if (line.trim() === '') continue;
      
      // Match "  command [options]  Description"
      const match = line.match(/^  ([a-z-]+)(?:\s+\[[^\]]+\]|\s+<[^>]+>)*\s+(.*)/);
      if (match) {
        commands.push(match[1]);
      } else if (line.match(/^  [a-z-]+/)) {
         // Fallback simpler match just in case
         const cmd = line.trim().split(' ')[0];
         if (!commands.includes(cmd) && cmd !== 'help') {
           commands.push(cmd);
         }
      }
    }
  }
  return commands;
}

try {
  const output = execSync('hardkas --help').toString();
  const baseCommands = getCommands(output);
  
  const matrix = {};
  
  for (const cmd of baseCommands) {
    if (cmd === 'help') continue;
    
    matrix[cmd] = {
      subcommands: {},
      helpTested: false,
      validSmoke: false,
      invalidSmoke: false,
      usedInApp: false,
      appName: null,
      result: null,
      notes: ""
    };
    
    // Try to get subcommands
    try {
      const subOutput = execSync(`hardkas ${cmd} --help`).toString();
      const subCommandsList = getCommands(subOutput);
      
      for (const sub of subCommandsList) {
        if (sub !== 'help') {
           matrix[cmd].subcommands[sub] = {
             helpTested: false,
             validSmoke: false,
             invalidSmoke: false,
             usedInApp: false,
             appName: null,
             result: null,
             notes: ""
           };
        }
      }
    } catch (e) {
      // Command might not have subcommands or failed to run --help
      matrix[cmd].notes = "No subcommands or failed --help";
    }
  }

  fs.writeFileSync(path.join(REPORTS_DIR, 'command-matrix.json'), JSON.stringify(matrix, null, 2));
  console.log('Command matrix initialized successfully.');
} catch (e) {
  console.error('Failed to initialize matrix', e);
}
