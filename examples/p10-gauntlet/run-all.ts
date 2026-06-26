import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const gauntletDir = path.join(process.cwd(), "examples", "p10-gauntlet");

const apps = [
  "01-local-payment-flow",
  "02-wallet-dev-flow",
  "03-batch-payments-local",
  "04-mini-indexer",
  "05-artifact-replay-lab",
  "06-query-projection-lab",
  "07-failure-cases-lab",
  "08-programmability-boundary-lab",
  "09-security-boundary-lab",
  "10-localnet-recovery-lab",
];

async function runApp(appName: string) {
  return new Promise<void>((resolve, reject) => {
    console.log(`\n======================================================`);
    console.log(`Running: ${appName}`);
    console.log(`======================================================`);
    
    const appDir = path.join(gauntletDir, appName);
    
    // Use tsx to run the script
    const child = spawn("npx", ["tsx", "scripts/run.ts"], {
      cwd: appDir,
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${appName} failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  for (const app of apps) {
    try {
      await runApp(app);
    } catch (err: any) {
      console.error(`\n❌ ERROR in ${app}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`\n✅ All 10 apps executed successfully.`);
}

main().catch(console.error);
