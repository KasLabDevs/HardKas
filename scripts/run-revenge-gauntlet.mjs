import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

const workspace = path.join(process.cwd(), '..', 'external-gauntlet-runs');
if (fs.existsSync(workspace)) {
  fs.rmSync(workspace, { recursive: true, force: true });
}
fs.mkdirSync(workspace, { recursive: true });

const apps = [
  { name: "01-wallet-backend", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      await sdk.accounts.fund('alice', { amount: '1000' });
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '10' });
      const signed = await sdk.tx.sign(plan, 'alice');
      const tx = await sdk.tx.send(signed);
      console.log('SUCCESS', tx.txId);
    }
    run();
  `},
  { name: "02-react-wallet", type: "react", code: `
    import { Hardkas } from '@hardkas/sdk';
    console.log(Hardkas);
  `},
  { name: "03-audit-explorer-node", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      const artifacts = await sdk.artifacts.list();
      console.log('Artifacts:', artifacts.length);
    }
    run();
  `},
  { name: "04-audit-explorer-react", type: "react", code: `
    import { Hardkas } from '@hardkas/sdk';
    console.log('React Explorer');
  `},
  { name: "05-document-notary-node", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      try {
        await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '0' });
      } catch (e) {
        if (e.message.includes('amount > 0')) console.log('Expected Error');
        else throw e;
      }
    }
    run();
  `},
  { name: "06-document-notary-react", type: "react", code: `
    import { useHardkas } from '@hardkas/react';
    console.log('Notary React');
  `},
  { name: "07-game-backend", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      const b = await sdk.accounts.balance('alice');
      console.log('Balance:', b);
    }
    run();
  `},
  { name: "08-game-dashboard", type: "react", code: `
    import { Hardkas } from '@hardkas/sdk';
    console.log('Game Dashboard');
  `},
  { name: "09-payroll-service", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      await sdk.accounts.fund('alice', { amount: '500' });
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '5' });
      const signed = await sdk.tx.sign(plan, 'alice');
      await sdk.tx.send(signed);
    }
    run();
  `},
  { name: "10-payroll-ui", type: "react", code: `
    import { useHardkas } from '@hardkas/react';
    console.log('Payroll UI');
  `},
  { name: "11-dao-multisig-node", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      await sdk.accounts.fund('alice', { amount: '100' });
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '10' });
      const sig1 = await sdk.tx.sign(plan, 'alice', { requiredSigners: ['alice', 'bob'], threshold: 2 });
      const sig2 = await sdk.tx.sign(sig1, 'bob');
      await sdk.tx.send(sig2);
    }
    run();
  `},
  { name: "12-dao-dashboard", type: "react", code: `
    import { Hardkas } from '@hardkas/sdk';
    console.log('DAO React');
  `},
  { name: "13-backup-integrity", type: "node", code: `
    import { execSync } from 'node:child_process';
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      // Fallback CLI since replay.verify isn't in public facade yet!
      execSync('npx hardkas replay verify', { stdio: 'pipe' });
      console.log('Fallback used');
    }
    run();
  `, fallback: true },
  { name: "14-ci-artifact-verifier", type: "node", code: `
    import { execSync } from 'node:child_process';
    async function run() {
      execSync('npx hardkas artifact verify .hardkas/artifacts/ --recursive', { stdio: 'pipe' });
    }
    run();
  `, fallback: true },
  { name: "15-agent-wallet", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      await sdk.accounts.list();
    }
    run();
  `},
  { name: "16-agent-approval-flow", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '1' });
      console.log(plan);
    }
    run();
  `},
  { name: "17-mini-indexer", type: "node", code: `
    import { execSync } from 'node:child_process';
    async function run() {
      execSync('npx hardkas query sql "SELECT * FROM artifacts"', { stdio: 'pipe' });
    }
    run();
  `, fallback: true },
  { name: "18-query-store-test", type: "node", code: `
    import { execSync } from 'node:child_process';
    async function run() {
      execSync('npx hardkas query store sync', { stdio: 'pipe' });
    }
    run();
  `, fallback: true },
  { name: "19-dashboard-integration", type: "react", code: `
    import { Hardkas } from '@hardkas/sdk';
    console.log('Integration');
  `},
  { name: "20-kastj-migration-spike", type: "node", code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd() });
      // Kastj typically requires building transactions manually and simulating them.
      // We check if SDK provides enough tooling.
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '5' });
      if (!plan.unsignedPayloadHash) throw new Error("Missing Kastj hash access");
      const signed = await sdk.tx.sign(plan, 'alice');
      if (!signed.signedTransaction) throw new Error("Missing Kastj payload access");
      console.log('Kastj spike works');
    }
    run();
  `}
];

const results = [];
let sdkApiGapMatrix = { missingApis: [], expectedBrowserBoundaries: [], cliFallbacks: [] };

async function main() {
  for (const app of apps) {
    console.log(`\n--- Running ${app.name} ---`);
    const appDir = path.join(workspace, app.name);
    fs.mkdirSync(appDir);
    
    const start = Date.now();
    let status = 'SUCCESSFUL';
    let errorMessage = '';
    let artifactsCount = 0;
    
    try {
      // 1. Write Source
      if (app.type === 'node') {
        fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: app.name, type: "module" }));
        fs.writeFileSync(path.join(appDir, 'index.mjs'), app.code);
      } else {
        fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: app.name, type: "module" }));
        // Vite mock setup
        fs.writeFileSync(path.join(appDir, 'vite.config.ts'), 'export default {}');
        fs.writeFileSync(path.join(appDir, 'src.ts'), app.code);
      }

      // 2. Install SDK from NPM
      console.log('Installing @hardkas/sdk@0.7.9-alpha...');
      execSync('npm install @hardkas/sdk@0.7.9-alpha @hardkas/cli@0.7.9-alpha', { cwd: appDir, stdio: 'ignore' });
      if (app.code.includes('@hardkas/react')) {
         try {
           execSync('npm install @hardkas/react@0.7.9-alpha', { cwd: appDir, stdio: 'ignore' });
         } catch(e) {
           // Might not be published yet, ignore for now to let the import fail naturally
         }
      }

      // 3. Init Workspace
      execSync('npx @hardkas/cli init . --skip-install', { cwd: appDir, stdio: 'ignore' });

      // 4. Execute
      if (app.type === 'node') {
        execSync('node index.mjs', { cwd: appDir, stdio: 'pipe' });
      } else {
        // We simulate a vite build by just running node or tsc
        // Because of direct imports, node will throw if it has fs inside React
        execSync('node src.ts', { cwd: appDir, stdio: 'pipe' });
      }
      
      if (app.fallback) {
        status = 'PARTIAL';
        sdkApiGapMatrix.cliFallbacks.push({ app: app.name, reason: "CLI fallback used for core operation" });
      }

    } catch (e) {
      errorMessage = e.stdout?.toString() || e.stderr?.toString() || e.message;
      if (app.type === 'react' && (errorMessage.includes('fs') || errorMessage.includes('path') || errorMessage.includes('crypto'))) {
        status = 'EXPECTED_BROWSER_BOUNDARY';
        sdkApiGapMatrix.expectedBrowserBoundaries.push({ app: app.name, error: "fs/path/crypto browser boundary hit" });
      } else if (app.type === 'react' && app.code.includes('@hardkas/react')) {
        status = 'FAILED';
        errorMessage = 'P1/P2 DX gap: @hardkas/react failed or missing';
        sdkApiGapMatrix.missingApis.push({ app: app.name, missing: "@hardkas/react context/hooks" });
      } else {
        status = 'FAILED';
        sdkApiGapMatrix.missingApis.push({ app: app.name, missing: "Runtime error or missing export", error: errorMessage });
      }
    }
    
    // Count artifacts
    const artifactsDir = path.join(appDir, '.hardkas', 'artifacts');
    if (fs.existsSync(artifactsDir)) {
      artifactsCount = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.json')).length;
    }

    const duration = Date.now() - start;
    console.log(`Status: ${status} | Artifacts: ${artifactsCount} | Time: ${duration}ms`);
    
    results.push({
      name: app.name,
      type: app.type,
      status,
      artifacts: artifactsCount,
      durationMs: duration,
      error: status === 'FAILED' ? errorMessage.substring(0, 100) : null
    });
  }

  // Generate Reports
  fs.writeFileSync(path.join(process.cwd(), 'results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(process.cwd(), 'sdk-api-gap-matrix.json'), JSON.stringify(sdkApiGapMatrix, null, 2));
  console.log('DONE');
}

main();
