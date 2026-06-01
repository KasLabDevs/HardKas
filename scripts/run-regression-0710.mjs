import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

const workspace = path.join(process.cwd(), '..', 'external-0710-regression');
if (fs.existsSync(workspace)) {
  fs.rmSync(workspace, { recursive: true, force: true });
}
fs.mkdirSync(workspace, { recursive: true });

const apps = [
  { name: '01-wallet-backend', type: 'node', code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: 'simulated' });
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '10' });
      // Important: simulate WITHOUT persist
      const { receipt } = await sdk.tx.simulate(plan, { persist: false });
      if (!receipt || !receipt.txId) throw new Error('Receipt missing from simulated planObject');
      console.log('SUCCESS', receipt.txId);
    }
    run().catch(e => { console.error(e); process.exit(1); });
  `},
  { name: '07-game-backend', type: 'node', code: `
    import { Hardkas } from '@hardkas/sdk';
    import fs from 'node:fs';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: 'simulated' });
      
      const balanceObj = await sdk.accounts.balance('alice');
      console.log('SUCCESS', balanceObj.sompi.toString());
    }
    run().catch(e => { console.error(e); process.exit(1); });
  `},
  { name: '09-payroll-service', type: 'node', code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: 'simulated' });
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '5' });
      // In memory simulate -> sign -> send
      const simulated = await sdk.tx.simulate(plan, { persist: false });
      const signed = await sdk.tx.sign(plan, 'alice', { persist: false });
      const sent = await sdk.tx.send(signed, { persist: false });
      if (!sent.txId) throw new Error('Missing sent txId');
      console.log('SUCCESS', sent.txId);
    }
    run().catch(e => { console.error(e); process.exit(1); });
  `},
  { name: '11-dao-multisig', type: 'node', code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: 'simulated' });
      const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '10' });
      const sig1 = await sdk.tx.sign(plan, 'alice', { requiredSigners: ['alice', 'bob'], threshold: 2, persist: false });
      const sig2 = await sdk.tx.sign(sig1, 'bob', { persist: false });
      const res = await sdk.tx.simulate(sig2, { persist: false });
      if (!res.receipt) throw new Error('Simulate multisig failed');
      console.log('SUCCESS', res.receipt.txId);
    }
    run().catch(e => { console.error(e); process.exit(1); });
  `},
  { name: '14-ci-verifier', type: 'node', code: `
    import { Hardkas } from '@hardkas/sdk';
    async function run() {
      const sdk = await Hardkas.create({ cwd: process.cwd(), autoBootstrap: true, network: 'simulated' });
      // Should not crash, just return valid: false
      try {
          const result = await sdk.artifacts.verify('invalid-artifact.json', { throwOnInvalid: false });
          if (result.valid !== false) throw new Error('Expected valid: false');
          if (!result.reason) throw new Error('Expected a reason');
          console.log('SUCCESS', result.reason);
      } catch (e) {
          if (e.message.includes('ENOENT') || e.message.includes('No such file')) {
               // The artifacts validation uses readFileSync natively when checking, if it errors due to not found before the throwOnInvalid check, let's catch it. 
               // Actually we should create the invalid artifact to test the internal schema parsing correctly!
          } else {
               throw e;
          }
      }
    }
    
    import fs from 'node:fs';
    fs.writeFileSync('invalid-artifact.json', JSON.stringify({ type: "UNKNOWN", random: 123 }));
    run().catch(e => { console.error(e); process.exit(1); });
  `}
];

console.log('--- Targeted Regression 0.7.11-alpha ---');
console.log('Workspace:', workspace);

for (const app of apps) {
  const appDir = path.join(workspace, app.name);
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
    name: app.name,
    type: 'module'
  }, null, 2));

  console.log(`[APP] ${app.name} - Init...`);
  execSync('npm install @hardkas/sdk@0.7.11-alpha @hardkas/cli@0.7.11-alpha typescript @types/node tsx --no-fund --no-audit', { cwd: appDir, stdio: 'ignore' });
  
  if (app.type === 'node') {
    fs.writeFileSync(path.join(appDir, 'index.ts'), app.code);
    try {
      const out = execSync('npx tsx index.ts', { cwd: appDir, stdio: 'pipe' }).toString().trim();
      if (out.includes('SUCCESS')) {
        console.log(`✅ ${app.name}: PASSED`);
      } else {
        console.log(`❌ ${app.name}: FAILED (No SUCCESS printed)`);
        console.log(out);
        process.exit(1);
      }
    } catch (e) {
      console.log(`❌ ${app.name}: CRASHED`);
      console.log(e.stdout?.toString() || e.message);
      console.log(e.stderr?.toString());
      process.exit(1);
    }
  }
}
console.log('--- All targeted regressions PASSED ---');
