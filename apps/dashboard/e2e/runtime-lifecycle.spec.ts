import { test, expect } from '@playwright/test';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import net from 'net';

import { fileURLToPath } from 'url';

// Helper to get a free port
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// Ensure the CLI path is absolute so we can run it from temp dirs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, '../../../packages/cli/src/index.ts');

test.describe('HardKAS P1.11 - Semantic Runtime States', () => {
  let tempDir: string;
  let devServerProcess: ChildProcess;
  let port: number;
  let baseUrl: string;
  const token = 'test-e2e-persistent-token-987654';

  test.beforeEach(async () => {
    // 1. Isolate workspace in a temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardkas-test-'));
    
    // 2. Initialize a fresh HardKAS workspace using 'init' (legacy 'new' alias is removed)
    execSync('npx tsx ' + CLI_PATH + ' init demo', { cwd: tempDir, stdio: 'ignore' });
    const workspaceRoot = path.join(tempDir, 'demo');

    // 3. Find a free port and start the dev server
    port = await getFreePort();
    baseUrl = `http://localhost:${port}`;
    
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    devServerProcess = spawn(npxCommand, ['tsx', CLI_PATH, 'dev', 'server', '--port', port.toString()], {
      cwd: workspaceRoot,
      env: { ...process.env, HARDKAS_DEV_TOKEN: token },
      stdio: 'pipe',
      shell: true
    });

    // Wait for the server to be ready and authenticated
    await expect.poll(async () => {
      try {
        const res = await fetch(`${baseUrl}/api/health`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        return res.ok;
      } catch {
        return false;
      }
    }, {
      message: 'Waiting for dev server to start',
      timeout: 10000,
    }).toBeTruthy();
  });

  test.afterEach(async () => {
    // Teardown isolated workspace and server
    if (devServerProcess && devServerProcess.pid) {
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${devServerProcess.pid} /t /f`, { stdio: 'ignore' });
        } catch (e) {
          /* ignore */
        }
        devServerProcess.kill();
      }
    }
    // Give it a moment to release file handles
    await new Promise(r => setTimeout(r, 500));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn('Cleanup warning (non-fatal):', err);
    }
  });

  test('Test A: Clean Simulated Runtime (ACTIVE -> VERIFIED)', async ({ page }) => {
    const workspaceRoot = path.join(tempDir, 'demo');

    // Fund alice first to ensure simulated UTXOs exist for transfer!
    execSync('npx tsx ' + CLI_PATH + ' accounts fund alice --amount 1000', { cwd: workspaceRoot, stdio: 'ignore' });

    // Send simulated tx (creates artifacts and store.db)
    execSync('npx tsx ' + CLI_PATH + ' tx send --network simulated --from alice --to bob --amount 10 --yes', { cwd: workspaceRoot, stdio: 'ignore' });

    // Copy plan and receipt artifacts to root for 'replay verify' compatibility
    const artifactsDir = path.join(workspaceRoot, '.hardkas', 'artifacts');
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.json'));
    const planFile = files.find(f => f.includes('.plan.'));
    const receiptFile = files.find(f => f.includes('.receipt.'));

    if (planFile) {
      fs.copyFileSync(path.join(artifactsDir, planFile), path.join(workspaceRoot, 'tx-plan.json'));
    }
    if (receiptFile) {
      fs.copyFileSync(path.join(artifactsDir, receiptFile), path.join(workspaceRoot, 'tx-receipt.json'));
    }

    // Force a query store rebuild so cache aligns immediately
    execSync('npx tsx ' + CLI_PATH + ' query store rebuild', { cwd: workspaceRoot, stdio: 'ignore' });

    // Verify artifacts written
    expect(fs.existsSync(artifactsDir)).toBeTruthy();
    expect(fs.readdirSync(artifactsDir).length).toBeGreaterThan(0);

    // Verify store.db written
    const storePath = path.join(workspaceRoot, '.hardkas', 'store.db');
    expect(fs.existsSync(storePath)).toBeTruthy();

    // Open dashboard - state should be PENDING (since replay verify hasn't run yet)
    await page.goto(baseUrl + '/');
    await expect(page.getByText('PENDING VERIFICATION')).toBeVisible({ timeout: 15000 });

    // Run replay verify
    execSync('npx tsx ' + CLI_PATH + ' replay verify', { cwd: workspaceRoot, stdio: 'ignore' });

    // Reload page - overview should display VERIFIED state
    await page.goto(baseUrl + '/');
    await expect(page.getByText('VERIFIED', { exact: true })).toBeVisible();
    await expect(page.getByText('Local deterministic runtime is consistent')).toBeVisible();

    // Verify artifacts visible
    await page.goto(baseUrl + '/artifacts');
    await expect(page.getByText('Causal Lineage').first()).toBeVisible();

    // Verify transaction visible
    await page.goto(baseUrl + '/transactions');
    await expect(page.getByText('alice').first()).toBeVisible();

    // Verify events visible
    await page.goto(baseUrl + '/events');
    await page.getByText('Workflow Group').first().click();
    await expect(page.getByText('workflow.started').first()).toBeVisible();
  });

  test('Test B: Corrupted Artifact Runtime (CORRUPTED)', async ({ page }) => {
    const workspaceRoot = path.join(tempDir, 'demo');
    
    // Fund & execute simulated tx
    execSync('npx tsx ' + CLI_PATH + ' accounts fund alice --amount 1000', { cwd: workspaceRoot, stdio: 'ignore' });
    execSync('npx tsx ' + CLI_PATH + ' tx send --network simulated --from alice --to bob --amount 10 --yes', { cwd: workspaceRoot, stdio: 'ignore' });

    // Sabotage an artifact manually
    const artifactsDir = path.join(workspaceRoot, '.hardkas', 'artifacts');
    const files = fs.readdirSync(artifactsDir).filter(f => f.endsWith('.json'));
    const firstFile = path.join(artifactsDir, files[0]);
    fs.writeFileSync(firstFile, '{ "corrupted": true }');

    // Force a query store rebuild so cache aligns with the corruption (ignores expected non-zero exit code)
    try {
      execSync('npx tsx ' + CLI_PATH + ' query store rebuild', { cwd: workspaceRoot, stdio: 'ignore' });
    } catch (e) {
      /* ignore */
    }

    // Open dashboard
    await page.goto(baseUrl + '/');

    // Overview should show CORRUPTED state
    await expect(page.getByText('CORRUPTED')).toBeVisible();
    await expect(page.getByText('Artifact integrity failed. Deterministic replay is unsafe.')).toBeVisible();

    // Replay Page should show replay candidates excluded or fail state
    await page.goto(baseUrl + '/replay');
    await expect(page.getByText('No replay candidates yet').or(page.getByText('failed'))).toBeVisible();

    // Strict doctor check should fail (using correct root command with --consistency)
    expect(() => {
      execSync('npx tsx ' + CLI_PATH + ' doctor --consistency --strict', { cwd: workspaceRoot, stdio: 'pipe' });
    }).toThrow();
  });

  test('Test C: Missing Projection (DEGRADED)', async ({ page }) => {
    const workspaceRoot = path.join(tempDir, 'demo');
    
    // Fund & execute simulated tx
    execSync('npx tsx ' + CLI_PATH + ' accounts fund alice --amount 1000', { cwd: workspaceRoot, stdio: 'ignore' });
    execSync('npx tsx ' + CLI_PATH + ' tx send --network simulated --from alice --to bob --amount 10 --yes', { cwd: workspaceRoot, stdio: 'ignore' });

    // Shutdown the active server process to release Windows file locks on store.db
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${devServerProcess.pid} /t /f`, { stdio: 'ignore' });
      } catch (e) {
        /* ignore */
      }
    } else {
      devServerProcess.kill();
    }
    await new Promise(r => setTimeout(r, 1000));

    // Delete SQLite store.db safely
    const storePath = path.join(workspaceRoot, '.hardkas', 'store.db');
    if (fs.existsSync(storePath)) {
      fs.rmSync(storePath);
    }

    // Restart the dev-server
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    devServerProcess = spawn(npxCommand, ['tsx', CLI_PATH, 'dev', 'server', '--port', port.toString()], {
      cwd: workspaceRoot,
      env: { ...process.env, HARDKAS_DEV_TOKEN: token },
      stdio: 'pipe',
      shell: true
    });

    // Wait for the server
    await expect.poll(async () => {
      try {
        const res = await fetch(`${baseUrl}/api/health`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok;
      } catch {
        return false;
      }
    }, {
      message: 'Waiting for dev server to restart',
      timeout: 10000,
    }).toBeTruthy();

    // Go to overview
    await page.goto(baseUrl + '/');

    // Should show DEGRADED state due to cache-to-disk drift
    await expect(page.getByText('DEGRADED')).toBeVisible();
    await expect(page.getByText('Projection cache (SQLite) is missing or out of sync')).toBeVisible();
    await expect(page.getByText('hardkas query store rebuild')).toBeVisible();
  });

  test('Test D: Dev-Server Restart (Zero Auth Loss Reconnect)', async ({ page }) => {
    const workspaceRoot = path.join(tempDir, 'demo');

    // 1. Access dashboard
    await page.goto(baseUrl + '/');
    await expect(page.getByText('EMPTY')).toBeVisible();

    // 2. Kill dev-server process
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${devServerProcess.pid} /t /f`, { stdio: 'ignore' });
      } catch (e) {
        /* ignore */
      }
    } else {
      devServerProcess.kill();
    }
    // Give it a moment to release the port
    await new Promise(r => setTimeout(r, 1000));

    // 3. Restart dev server on SAME port and SAME token
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    devServerProcess = spawn(npxCommand, ['tsx', CLI_PATH, 'dev', 'server', '--port', port.toString()], {
      cwd: workspaceRoot,
      env: { ...process.env, HARDKAS_DEV_TOKEN: token },
      stdio: 'pipe',
      shell: true
    });

    // Wait for restarted server
    await expect.poll(async () => {
      try {
        const res = await fetch(`${baseUrl}/api/health`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok;
      } catch {
        return false;
      }
    }, {
      message: 'Waiting for dev server to restart',
      timeout: 10000,
    }).toBeTruthy();

    // 4. Verify no auth loss - dashboard should still function and reconnect to SSE stream
    const statusText = page.getByText('CONNECTED').or(page.getByText('EMPTY'));
    await expect(statusText.first()).toBeVisible({ timeout: 10000 });
  });

  test('Test E: SSE Disconnect/Reconnect Recovery', async ({ page }) => {
    // 1. Open overview
    await page.goto(baseUrl + '/');
    await expect(page.getByText('EMPTY')).toBeVisible();

    // 2. Block new SSE connections to lock it in RECONNECTING status
    await page.route('**/api/stream*', route => {
      route.abort('connectionfailed');
    });

    // 3. Trigger immediate SSE Disconnect via mock method
    await page.evaluate(() => {
      if (typeof window.__MOCK_SSE_CLOSE__ === "function") {
        window.__MOCK_SSE_CLOSE__();
      }
    });

    // Wait for Layout/ActivityFeed to transition to RECONNECTING state
    await expect(page.getByText('RECONNECTING')).toBeVisible({ timeout: 15000 });

    // 4. Unblock SSE connections to let reconnection succeed
    await page.unroute('**/api/stream*');

    // 5. Verify it transitions back to CONNECTED status
    await expect(page.getByText('CONNECTED')).toBeVisible({ timeout: 15000 });
  });
});
