import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const pathsToCheck = [
  'packages',
  'scripts',
  'docs',
  'artifacts',
  'test-gauntlet'
];

// We don't want to fail if the scanner itself contains the string, so we obfuscate them slightly in the regex
const forbiddenClaims = [
  { pattern: '\\bZK_READY\\b', reason: 'Claiming absolute ZK readiness is strictly forbidden. Use ZK_CORPUS_SURFACE_READY instead.' },
  { pattern: '\\bONCHAIN_ZK_READY\\b', reason: 'On-chain ZK verification is not claimed.' },
  { pattern: '\\bZK_ONCHAIN_VERIFICATION_READY\\b', reason: 'On-chain ZK verification is not claimed.' },
  { pattern: '\\bVPROGS_READY\\b', reason: 'Claiming absolute vProgs readiness is forbidden. Use VPROGS_INSPECT_SURFACE_READY instead.' },
  { pattern: '\\bVPROGS_RUNTIME_READY\\b', reason: 'vProgs runtime is explicitly not claimed.' },
  { pattern: '\\bMAINNET_READY\\b', reason: 'Mainnet is explicitly not claimed.' },
  { pattern: '\\bTESTNET_READY\\b', reason: 'Testnet is explicitly not claimed.' },
  { pattern: '\\bTRUSTLESS_BRIDGE_READY\\b', reason: 'Trustless bridge is explicitly not claimed.' },
  { pattern: '\\bVM_CONSENSUS_EQUIVALENCE_READY\\b', reason: 'VM consensus equivalence is explicitly not claimed.' },
  { pattern: '\\bstable vProgs API\\b', reason: 'Stable vProgs API is explicitly not claimed.' },
  { pattern: '\\bTRUSTLESS_EXIT_READY\\b', reason: 'Trustless exit is not part of programmability surface.' }
];

const ignoredFiles = [
  'check-forbidden-claims.mjs',
  'ARCHITECTURE_FREEZE_REPORT.md', // allow mentioning them in the freeze report
  'task.md',
  'implementation_plan.md',
  'programmability-surface.mjs',
  '11-limitations.md',
  'release-claims.md'
];

let failed = false;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    // skip node_modules and .git
    if (f.name === 'node_modules' || f.name === '.git' || f.name === 'dist') continue;
    
    const fullPath = path.join(dir, f.name);
    if (f.isDirectory()) {
      scanDir(fullPath);
    } else if (f.isFile() && !ignoredFiles.includes(f.name)) {
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath) {
  // Only scan text-based files
  if (!filePath.match(/\.(js|mjs|cjs|ts|tsx|md|json|txt|mdx)$/)) return;
  if (!fs.existsSync(filePath)) return;
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const claim of forbiddenClaims) {
      const regex = new RegExp(claim.pattern);
      if (regex.test(line)) {
        // Double check it's not a documentation of "Prohibited: ZK_READY"
        if (line.includes('Prohibir:') || line.includes('Forbidden:') || line.includes('Prohibited:')) continue;
        
        console.error(`[FAIL] ${filePath}:${i + 1}`);
        console.error(`       Found forbidden claim: ${regex.source}`);
        console.error(`       Reason: ${claim.reason}`);
        console.error(`       Line: ${line.trim()}\n`);
        failed = true;
      }
    }
  }
}

if (process.argv.includes('--self-test')) {
  console.log('Running Forbidden Claims Guard Self-Test...');
  const tmpDir = path.join(rootDir, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
  
  let allPass = true;
  
  // Test 1: Forbidden claims should trigger failure
  const testClaims = [
    "ZK_READY", "ONCHAIN_ZK_READY", "ZK_ONCHAIN_VERIFICATION_READY",
    "VPROGS_READY", "VPROGS_RUNTIME_READY", "MAINNET_READY",
    "TESTNET_READY", "TRUSTLESS_BRIDGE_READY", "VM_CONSENSUS_EQUIVALENCE_READY"
  ];
  
  for (const claim of testClaims) {
    const tmpFile = path.join(tmpDir, `test-${claim}.txt`);
    fs.writeFileSync(tmpFile, `This is a test claim: ${claim}\n`, 'utf8');
    
    // Scan just this file
    const previousFailed = failed;
    failed = false;
    scanFile(tmpFile);
    fs.unlinkSync(tmpFile);
    
    if (!failed) {
      console.error(`[SELF-TEST FAIL] Did not detect forbidden claim: ${claim}`);
      allPass = false;
    } else {
        console.log(`[SELF-TEST PASS] Successfully detected forbidden claim: ${claim}`);
    }
    // Restore state
    failed = previousFailed;
  }
  
  // Test 2: Permitted claims should NOT trigger failure
  const permittedClaims = [
    "ZK_CORPUS_SURFACE_READY", "VPROGS_INSPECT_SURFACE_READY"
  ];
  for (const claim of permittedClaims) {
    const tmpFile = path.join(tmpDir, `test-permitted-${claim}.txt`);
    fs.writeFileSync(tmpFile, `This is an allowed claim: ${claim}\n`, 'utf8');
    
    const previousFailed = failed;
    failed = false;
    scanFile(tmpFile);
    fs.unlinkSync(tmpFile);
    
    if (failed) {
      console.error(`[SELF-TEST FAIL] False positive on permitted claim: ${claim}`);
      allPass = false;
    } else {
        console.log(`[SELF-TEST PASS] Successfully allowed permitted claim: ${claim}`);
    }
    // Restore state
    failed = previousFailed;
  }
  
  if (allPass) {
    console.log('Self-Test: PASS');
    process.exit(0);
  } else {
    console.error('Self-Test: FAIL');
    process.exit(1);
  }
}

for (const p of pathsToCheck) {
  const full = path.join(rootDir, p);
  if (fs.existsSync(full)) {
    if (fs.statSync(full).isDirectory()) {
      scanDir(full);
    } else {
      scanFile(full);
    }
  }
}

if (failed) {
  console.error('FORBIDDEN_CLAIMS_SCAN_FAILED');
  process.exit(1);
} else {
  console.log('PROGRAMMABILITY_SURFACE_CLAIMS_FROZEN');
  console.log('ZK_CLAIM_BOUNDARIES_FROZEN');
  console.log('VPROGS_INSPECT_BOUNDARY_FROZEN');
}
