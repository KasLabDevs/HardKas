import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const tsx = 'npx';
const runArgs = ['tsx', 'packages/cli/src/index.ts'];

async function runBenchmark() {
  console.log("Starting benchmark for 200 transactions...\n");

  // 1. Shell Loop Simulation (using node loops + execa to simulate shell loop for 20 tx and extrapolate)
  console.log("1. Shell Loop Simulation (20 tx extrapolated to 200)...");
  const startShell = performance.now();
  for (let i = 0; i < 20; i++) {
    const to = i % 2 === 0 ? "bob" : "carol";
    const amount = (0.01 + (i % 10) * 0.001).toFixed(3);
    execSync(`${tsx} ${runArgs.join(' ')} tx send --from alice --to ${to} --amount ${amount} --network simulated --yes`, { stdio: 'ignore' });
  }
  const endShell = performance.now();
  const shellDuration = (endShell - startShell) * 10; // Extrapolate to 200
  console.log(`Shell Loop Duration: ${shellDuration.toFixed(2)} ms (${(shellDuration / 1000).toFixed(2)} s)\n`);

  // 2. dev tx generate
  console.log("2. dev tx generate --count 200...");
  const startDev = performance.now();
  execSync(`${tsx} ${runArgs.join(' ')} dev tx generate --count 200`, { stdio: 'ignore' });
  const endDev = performance.now();
  const devDuration = endDev - startDev;
  console.log(`dev tx generate Duration: ${devDuration.toFixed(2)} ms (${(devDuration / 1000).toFixed(2)} s)\n`);

  console.log("=== RESULTS ===");
  console.log(`Shell loop: ${shellDuration.toFixed(2)} ms`);
  console.log(`Batch gen : ${devDuration.toFixed(2)} ms`);
  console.log(`Speedup   : ${(shellDuration / devDuration).toFixed(2)}x faster`);
}

runBenchmark().catch(console.error);
