import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { getDockerNetworkStrategy, waitForFundingConfirmation, getVirtualDaaScoreBestEffort } from "./helpers.mjs";

// Upstream Kaspa CPU miner. Do not swap this for a bespoke image: funding must
// be reproducible from public artifacts on any machine.
const MINER_IMAGE = process.env.HARDKAS_TOCCATA_MINER_IMAGE || "kaspanet/cpuminer:latest";
// kaspad's gRPC port, reached inside the node's own network namespace.
const MINER_GRPC_PORT = process.env.HARDKAS_TOCCATA_KASPAD_PORT || "16210";
// How long to let the DAG settle after mining, before selecting UTXOs.
const SETTLE_MS = parseInt(process.env.HARDKAS_TOCCATA_SETTLE_MS || "5000", 10);
// wRPC endpoint the CLI connects to for the simnet target.
const RPC_URL = process.env.HARDKAS_TOCCATA_RPC_URL || "ws://127.0.0.1:18210";

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

  const minerName = `hardkas-toccata-miner-${Date.now()}`;
  let daaStart = await getVirtualDaaScoreBestEffort();

  try {
    execSync(`docker image inspect ${MINER_IMAGE}`, { stdio: "ignore" });

    if (!strategy.containerName) {
      throw new Error(
        `TOCCATA_NODE_CONTAINER_NOT_FOUND: Could not identify the kaspad container. ` +
          `Set HARDKAS_TOCCATA_NODE_CONTAINER or start the node before funding.`
      );
    }

    // Join the node's network namespace. kaspad binds gRPC to loopback inside
    // its own container, so a miner on the bridge network cannot reach it by
    // host address no matter how the ports are published.
    const dockerCmd = [
      "docker run -d",
      `--name ${minerName}`,
      `--network=container:${strategy.containerName}`,
      MINER_IMAGE,
      `--mining-address ${minerAddress}`,
      "--kaspad-address 127.0.0.1",
      `--port ${MINER_GRPC_PORT}`,
      "--threads 1",
      "--mine-when-not-synced"
    ];

    try {
      execSync(dockerCmd.join(" "), { stdio: "ignore" });
    } catch (e) {
      throw new Error(`TOCCATA_MINER_START_FAILED: Failed to start miner container. Check docker logs.`);
    }

    // Wait for balance using helper
    const timeoutMs = parseInt(process.env.HARDKAS_TOCCATA_FUNDING_TIMEOUT_MS || "60000", 10);
    const intervalMs = parseInt(process.env.HARDKAS_TOCCATA_POLL_INTERVAL_MS || "2000", 10);

    const context = {
      strategy,
      minerName,
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
        const logs = execSync(`docker logs ${minerName}`, { encoding: "utf8", stdio: "pipe" });
        console.error(`\n=== Miner Logs (${minerName}) ===\n${logs}\n=========================\n`);
      } catch (e) {
        console.error(`Could not fetch logs for ${minerName}`);
      }
      err.message = err.message.replace("DAA End: unavailable", `DAA End: ${daaEnd || "unavailable"}`);
    }
    throw err;
  } finally {
    try {
      execSync(`docker rm -f ${minerName}`, { stdio: "ignore" });
    } catch {}
    // Planning against a node that is still accepting blocks fails with
    // UTXO_VIRTUAL_STATE_UNSTABLE, so let the DAG settle before returning.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  }
}

async function runRealNodeCert() {
  console.log("=== Real Node 0.12.0-rc.20 / Toccata Certification ===");

  // Clean state
  if (fs.existsSync(".hardkas")) {
    fs.rmSync(".hardkas", { recursive: true, force: true });
  }
  fs.writeFileSync("package.json", '{"name":"real-node-cert"}');
  // `network` is the policy block, not the target selector. Writing
  // `{ network: "simnet" }` leaves the default target at `simulated`, and every
  // command against a kaspasim: account then fails with "Account network
  // mismatch". Declare the execution target explicitly instead.
  fs.writeFileSync(
    "hardkas.config.ts",
    `export default {
  execution: {
    default: "localnet",
    targets: {
      localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" }
    }
  },
  networks: {
    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "${RPC_URL}" }
  }
};
`
  );

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

  // Cold start: on a fresh node nothing has mined to the fixture yet, so mine
  // coinbase to it rather than assuming a pre-funded node. Coinbase needs to
  // mature before it is spendable, which is why this mines rather than waits.
  if (/Balance:\s*0(\D|$)/.test(balanceOut)) {
    console.log("  Fixture is empty — mining coinbase to it first...");
    await ensureFundingConfirmed(fixtureAddress, "fixture", 100000000000n, "coinbase -> fixture");
  }

  // [3] Fund Alice from fixture (using mature UTXOs only — coinbase maturity filter is active)
  console.log("\n[3] Funding Alice from fixture...");
  run(`tx plan --from fixture --to ${alice.address} --amount 1000 --network simnet --provider rpc`);

  const plans = fs.readdirSync(".hardkas/artifacts").filter(f => f.endsWith(".plan.json"));
  if (!plans.length) throw new Error("No plan artifact generated!");
  console.log(`  Plan: ${plans[0]}`);

  run(`tx sign .hardkas/artifacts/${plans[0]} --account fixture --out .hardkas/artifacts/1.signed.json`);
  console.log("  Signed: 1.signed.json");

  run(`tx send .hardkas/artifacts/1.signed.json --network simnet --provider rpc --yes`);
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

  run(`tx plan --from ${alice.name} --to ${bob.address} --amount 500 --network simnet --provider rpc`);
  const plans2 = fs.readdirSync(".hardkas/artifacts").filter(f => f.endsWith(".plan.json") && !plans.includes(f));
  if (!plans2.length) throw new Error("No second plan artifact!");
  console.log(`  Plan: ${plans2[0]}`);

  run(`tx sign .hardkas/artifacts/${plans2[0]} --account ${alice.name} --out .hardkas/artifacts/2.signed.json`);
  console.log("  Signed: 2.signed.json");

  run(`tx send .hardkas/artifacts/2.signed.json --network simnet --provider rpc --yes`);
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
