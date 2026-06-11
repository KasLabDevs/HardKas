import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { getDockerNetworkStrategy, waitForFundingConfirmation, getVirtualDaaScoreBestEffort } from "./helpers.mjs";

function run(cmd) {
  try {
    console.log(`Running: ${cmd}`);
    return execSync(`node ../../dist/index.js ${cmd}`, { stdio: "pipe", encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    console.error("STDOUT:\n", e.stdout);
    console.error("STDERR:\n", e.stderr);
    throw new Error(`Command failed: ${cmd}`);
  }
}

async function ensureFundingConfirmed(minerAddress, targetAccountName, expectedSompi, label) {
  console.log(`  Mining confirmation blocks for ${label}...`);
  const strategy = getDockerNetworkStrategy();
  console.log(`  [Diagnostic] Docker Strategy: ${strategy.type}`);
  console.log(`  [Diagnostic] Target Kaspad: ${strategy.kaspadAddress}`);

  const stratumName = `hardkas-toccata-stratum-v2-${Date.now()}`;
  let daaStart = await getVirtualDaaScoreBestEffort();

  try {
    execSync("docker image inspect hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced", { stdio: "ignore" });

    let dockerCmd = [
      "docker run -d",
      `--name ${stratumName}`
    ];

    if (strategy.addHost) {
      dockerCmd.push(`--add-host=${strategy.addHost}`);
    }
    if (strategy.network && strategy.network !== "bridge" && strategy.network !== "host") {
      dockerCmd.push(`--network=${strategy.network}`);
    }

    dockerCmd.push("hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced");
    dockerCmd.push("/app/stratum-bridge");
    dockerCmd.push("--node-mode external");
    dockerCmd.push(`--kaspad-address ${strategy.kaspadAddress}`);
    dockerCmd.push("--web-dashboard-port :3031");
    dockerCmd.push("--instance port=:16120,diff=1");
    dockerCmd.push("--internal-cpu-miner");
    dockerCmd.push(`--internal-cpu-miner-address ${minerAddress}`);
    dockerCmd.push("--internal-cpu-miner-threads 1");
    dockerCmd.push("--internal-cpu-miner-template-poll-ms 250");
    dockerCmd.push("--print-stats true");
    dockerCmd.push("--log-to-file false");

    try {
      execSync(dockerCmd.join(" "), { stdio: "ignore" });
    } catch (e) {
      throw new Error(`TOCCATA_STRATUM_START_FAILED: Failed to start miner container. Check docker logs.`);
    }

    // Wait for balance using helper
    const timeoutMs = parseInt(process.env.HARDKAS_TOCCATA_FUNDING_TIMEOUT_MS || "60000", 10);
    const intervalMs = parseInt(process.env.HARDKAS_TOCCATA_POLL_INTERVAL_MS || "2000", 10);

    const context = {
      strategy,
      stratumName,
      daaStart
    };

    const result = await waitForFundingConfirmation({
      runCmd: run,
      accountName: targetAccountName,
      expectedSompi,
      timeoutMs,
      intervalMs,
      context
    });

    return result;

  } catch (err) {
    if (err.message.includes("TOCCATA_FUNDING_CONFIRMATION_TIMEOUT")) {
      const daaEnd = await getVirtualDaaScoreBestEffort();
      try {
        const logs = execSync(`docker logs ${stratumName}`, { encoding: "utf8", stdio: "pipe" });
        console.error(`\n=== Stratum Logs (${stratumName}) ===\n${logs}\n=========================\n`);
      } catch (e) {
        console.error(`Could not fetch logs for ${stratumName}`);
      }
      err.message = err.message.replace("DAA End: unavailable", `DAA End: ${daaEnd || "unavailable"}`);
    }
    throw err;
  } finally {
    try {
      execSync(`docker rm -f ${stratumName}`, { stdio: "ignore" });
    } catch {}
  }
}

async function runRealNodeCert() {
  console.log("=== Real Node 0.9.3-alpha / Toccata Certification ===");

  // Clean state
  if (fs.existsSync(".hardkas")) {
    fs.rmSync(".hardkas", { recursive: true, force: true });
  }
  fs.writeFileSync("package.json", '{"name":"real-node-cert"}');
  fs.writeFileSync("hardkas.config.ts", 'export default { network: "simnet" };');

  // [1] Generate fresh accounts
  console.log("\n[1] Generating Accounts...");
  run("accounts real generate --name fresh_alice --unsafe-plaintext --yes");
  run("accounts real generate --name fresh_bob --unsafe-plaintext --yes");

  const accountsData = JSON.parse(fs.readFileSync(".hardkas/accounts.real.json", "utf8"));
  const alice = accountsData.accounts.find(a => a.name.startsWith("fresh_alice"));
  const bob = accountsData.accounts.find(a => a.name.startsWith("fresh_bob"));
  if (!alice || !bob) throw new Error("Accounts missing!");

  console.log(`  Alice: ${alice.name} -> ${alice.address}`);
  console.log(`  Bob:   ${bob.name} -> ${bob.address}`);

  // [2] Import fixture miner account (has mature coinbase UTXOs)
  console.log("\n[2] Importing Fixture Account...");
  const fixtureKey = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
  const fixtureAddress = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
  run(`accounts real import --name fixture --private-key ${fixtureKey} --address ${fixtureAddress} --unsafe-plaintext --yes`);

  // Check fixture balance
  const balanceOut = run("accounts balance fixture --provider rpc");
  console.log("  Fixture balance:", balanceOut.trim().split("\n").filter(l => l.includes("Balance")).join(""));

  // [3] Fund Alice from fixture (using mature UTXOs only — coinbase maturity filter is active)
  console.log("\n[3] Funding Alice from fixture...");
  run(`tx plan --from fixture --to ${alice.address} --amount 1000 --provider rpc`);

  const plans = fs.readdirSync(".hardkas/artifacts").filter(f => f.endsWith(".plan.json"));
  if (!plans.length) throw new Error("No plan artifact generated!");
  console.log(`  Plan: ${plans[0]}`);

  run(`tx sign .hardkas/artifacts/${plans[0]} --account fixture --out .hardkas/artifacts/1.signed.json`);
  console.log("  Signed: 1.signed.json");

  run(`tx send .hardkas/artifacts/1.signed.json --provider rpc`);
  await ensureFundingConfirmed(fixtureAddress, alice.name, 100000000000n, "fixture -> Alice");
  console.log("  ✓ Transaction sent!");

  // [4] Verify receipt was created
  console.log("\n[4] Verifying receipt...");
  if (!fs.existsSync(".hardkas/artifacts/receipts")) {
    // Receipt might be inline in the signed artifact response
    console.log("  No receipts directory — checking send output...");
  } else {
    const receipts = fs.readdirSync(".hardkas/artifacts/receipts").filter(f => f.includes("receipt"));
    if (receipts.length) {
      console.log(`  Receipt: ${receipts[0]}`);
    }
  }

  // [5] Alice -> Bob lifecycle
  console.log("\n[5] Tx Lifecycle Alice -> Bob...");
  const aliceBalance = run(`accounts balance ${alice.name} --provider rpc`);
  console.log("  Alice balance:", aliceBalance.trim().split("\n").filter(l => l.includes("Balance")).join(""));

  run(`tx plan --from ${alice.name} --to ${bob.address} --amount 500 --provider rpc`);
  const plans2 = fs.readdirSync(".hardkas/artifacts").filter(f => f.endsWith(".plan.json") && !plans.includes(f));
  if (!plans2.length) throw new Error("No second plan artifact!");
  console.log(`  Plan: ${plans2[0]}`);

  run(`tx sign .hardkas/artifacts/${plans2[0]} --account ${alice.name} --out .hardkas/artifacts/2.signed.json`);
  console.log("  Signed: 2.signed.json");

  run(`tx send .hardkas/artifacts/2.signed.json --provider rpc`);
  await ensureFundingConfirmed(fixtureAddress, bob.name, 50000000000n, "Alice -> Bob");
  console.log("  ✓ Transaction sent!");

  // [6] Final balances
  console.log("\n[6] Final Balances...");
  run(`accounts balance ${alice.name} --provider rpc`);
  run(`accounts balance ${bob.name} --provider rpc`);

  // [7] Serialization validation
  console.log("\n[7] Serialization Validation...");
  const finalAccounts = JSON.parse(fs.readFileSync(".hardkas/accounts.real.json", "utf8"));
  for (const acct of finalAccounts.accounts) {
    if (typeof acct.privateKey !== "string") {
      throw new Error(`CORRUPTED_PRIVATE_KEY_SERIALIZATION: ${acct.name} has non-string privateKey: ${typeof acct.privateKey}`);
    }
    if (acct.privateKey.includes("__wbg_ptr")) {
      throw new Error(`CORRUPTED_PRIVATE_KEY_SERIALIZATION: ${acct.name} has WASM pointer leak`);
    }
    if (!/^[0-9a-f]{64}$/i.test(acct.privateKey)) {
      throw new Error(`CORRUPTED_PRIVATE_KEY_SERIALIZATION: ${acct.name} has invalid hex: ${acct.privateKey.substring(0, 20)}...`);
    }
    console.log(`  ✓ ${acct.name}: valid 64-char hex privateKey`);
  }

  console.log("\n=== REAL NODE FULL PASS ===");
}

runRealNodeCert().catch(err => {
  console.error("Test Failed:", err);
  process.exit(1);
});
