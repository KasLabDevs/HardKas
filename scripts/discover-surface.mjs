import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

const workspace = path.join(process.cwd(), '..', 'external-discovery-workspace');
const reportsDir = path.join(process.cwd(), 'reports');

if (fs.existsSync(workspace)) {
  fs.rmSync(workspace, { recursive: true, force: true });
}
fs.mkdirSync(workspace, { recursive: true });
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

console.log("Initializing discovery workspace at:", workspace);

// 1. Install packages
fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ name: "discovery-lab", type: "module" }));
console.log("Installing @hardkas/cli@0.7.11-alpha and @hardkas/sdk@0.7.11-alpha...");
execSync('npm install @hardkas/cli@0.7.11-alpha @hardkas/sdk@0.7.11-alpha', { cwd: workspace, stdio: 'ignore' });

const commands = [];
const sdkApis = [];
let totalCommands = 0;
let totalFlags = 0;

// Helper to run help and parse output
function runHelp(cmdPath) {
  const fullCmd = `npx hardkas ${cmdPath.join(' ')} --help`.trim();
  try {
    const stdout = execSync(fullCmd, { cwd: workspace, stdio: 'pipe' }).toString();
    return { stdout, error: null };
  } catch (e) {
    const stderr = e.stderr?.toString() || e.stdout?.toString() || e.message;
    return { stdout: stderr, error: true };
  }
}

function parseHelpOutput(cmdPath, stdout) {
  const isError = stdout.toLowerCase().includes('error:');
  const lines = stdout.split('\n');
  
  let currentSection = null;
  const subcommands = [];
  const flags = [];
  
  for (let line of lines) {
    if (line.startsWith('Commands:')) {
      currentSection = 'commands';
      continue;
    } else if (line.startsWith('Options:')) {
      currentSection = 'options';
      continue;
    } else if (line.startsWith('Positionals:')) {
      currentSection = 'positionals';
      continue;
    } else if (line.match(/^[A-Z][A-Za-z\s]+:/)) {
      currentSection = 'other';
      continue;
    }

    if (currentSection === 'commands') {
      // strict match for commander: "  subcommand [args]  Description"
      // or "  hardkas subcommand"
      const match = line.match(/^  (?:hardkas\s+)?([a-zA-Z0-9_-]+)(?:\s|$)/);
      if (match) {
        subcommands.push(match[1]);
      }
    } else if (currentSection === 'options') {
      const match = line.match(/^\s+(--[a-zA-Z0-9_-]+)(?:,\s+-[a-zA-Z0-9])?/);
      if (match) {
        flags.push(match[1]);
        totalFlags++;
      }
    }
  }

  // Deduplicate subcommands in case regex caught something weird, and ignore 'help'
  const uniqueSubcommands = [...new Set(subcommands)].filter(c => c !== 'help');
  const uniqueFlags = [...new Set(flags)];

  return { uniqueSubcommands, uniqueFlags, isError };
}

function classifyCommand(cmdPath, flags) {
  const pathStr = cmdPath.join(' ');
  const classification = {
    path: pathStr || 'hardkas',
    flags: flags,
    parent: cmdPath.slice(0, -1).join(' ') || null,
    runnable: true,
    dangerous: false,
    requiresNetwork: false,
    requiresArtifact: false,
    requiresSecret: false,
    requiresMainnet: false
  };

  // Heuristics for classification
  if (pathStr.includes('send') || pathStr.includes('sign') || pathStr.includes('append')) {
    classification.dangerous = true;
  }
  if (pathStr.includes('rpc') || pathStr.includes('network') || pathStr.includes('sync')) {
    classification.requiresNetwork = true;
  }
  if (pathStr.includes('verify') || pathStr.includes('simulate') || pathStr.includes('receipt') || pathStr.includes('send') || pathStr.includes('append') || pathStr.includes('sign')) {
    classification.requiresArtifact = true;
  }
  if (flags.some(f => f === '--secret' || f === '--mnemonic' || f === '--privateKey')) {
    classification.requiresSecret = true;
  }
  if (flags.some(f => f === '--mainnet')) {
    classification.requiresMainnet = true;
  }

  return classification;
}

console.log("Discovering CLI surface...");
function discoverCmd(cmdPath) {
  console.log(`> Exploring: hardkas ${cmdPath.join(' ')}`);
  const { stdout, error } = runHelp(cmdPath);
  
  if (error && !stdout.includes('Options:')) {
    console.log(`  [PARSE_FAILED] ${cmdPath.join(' ')}`);
    commands.push({
      path: cmdPath.join(' '),
      parseFailed: true,
      stdout
    });
    return;
  }

  // Commander prints root help if command is unknown. Prevent infinite recursion.
  const pathStr = cmdPath.join(' ');
  if (pathStr && stdout.includes('Usage: hardkas [options] [command]')) {
    // This implies the subcommand didn't exist and it dumped the main help
    return;
  }

  const { uniqueSubcommands, uniqueFlags, isError } = parseHelpOutput(cmdPath, stdout);
  
  if (uniqueSubcommands.length === 0) {
    // It's a leaf command
    totalCommands++;
    commands.push(classifyCommand(cmdPath, uniqueFlags));
  } else {
    // Intermediate node might be runnable too, we'll log it as a command but not a leaf
    // Some commands like `hardkas tx` might just be directories, we skip them from execution pool but log them.
    for (const sub of uniqueSubcommands) {
      // prevent infinite loops
      if (!cmdPath.includes(sub)) {
        discoverCmd([...cmdPath, sub]);
      }
    }
  }
}

// Start discovery
discoverCmd([]);

console.log(`Discovered ${totalCommands} CLI commands and ${totalFlags} total flags.`);

// 2. Discover SDK Surface by running a quick script inside the workspace
console.log("Discovering SDK surface...");
const sdkProbeScript = `
  import { Hardkas } from '@hardkas/sdk';
  const methods = Object.getOwnPropertyNames(Hardkas.prototype).filter(m => m !== 'constructor');
  const properties = Object.keys(new Hardkas({} as any)); // rough instantiation or just check the exported types
  // Better: we just read the generated typings or dynamically inspect the classes.
  
  // Since we want the facade, we'll create an instance and inspect it.
  async function probe() {
    try {
      const sdk = await Hardkas.create({ autoBootstrap: false });
      const api = {};
      for (const [key, val] of Object.entries(sdk)) {
        if (typeof val === 'object' && val !== null) {
           api[key] = Object.getOwnPropertyNames(Object.getPrototypeOf(val)).filter(m => m !== 'constructor');
        } else if (typeof val === 'function') {
           api[key] = 'function';
        }
      }
      console.log(JSON.stringify(api));
    } catch(e) {
      console.error(e);
    }
  }
  probe();
`;
fs.writeFileSync(path.join(workspace, 'probe.mjs'), sdkProbeScript);
try {
  const sdkOutput = execSync('node probe.mjs', { cwd: workspace, encoding: 'utf8' });
  const parsedSdk = JSON.parse(sdkOutput.trim().split('\n').pop() || '{}');
  for (const [namespace, methods] of Object.entries(parsedSdk)) {
    if (Array.isArray(methods)) {
      for (const method of methods) {
        sdkApis.push({ namespace, method, fullPath: `sdk.${namespace}.${method}` });
      }
    } else {
      sdkApis.push({ namespace: 'root', method: namespace, fullPath: `sdk.${namespace}` });
    }
  }
} catch (e) {
  console.log("Failed to dynamically probe SDK, will fall back to static list or partial execution.");
}

const report = {
  totalCommands,
  totalFlags,
  totalSdkApis: sdkApis.length,
  commands,
  sdkApis
};

fs.writeFileSync(path.join(reportsDir, 'full-command-surface.json'), JSON.stringify(report, null, 2));
console.log("Discovery complete! Wrote reports/full-command-surface.json");
