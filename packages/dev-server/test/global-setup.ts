import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createDevServer } from "../src/server.js";
import { stopHardkasWatcher } from "../src/watcher.js";
import { SimnetNodeHarness } from "../../testing/src/simnet-node-harness.js";
import { getHardkasFixtureKey } from "../../testing/src/fixture-signer.js";
import { ensureDevAccounts, getOrCreateDevAccount } from "@hardkas/accounts";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

let server: any;
let harness: any;
let workspace: string | undefined;

/** The JSON wRPC port of the localnet level's node (the canonical localnet port: the level's tests address it). */
const LOCALNET_RPC_PORT = 18210;
/**
 * REMED-CLOSE · the level's workspace: a temporary directory of its own (dev accounts, artifacts, receipts), never the
 * repository root. The tests read it from this variable (workers inherit the global setup's environment); the dev-server
 * routes from HARDKAS_ROOT.
 */
export const LOCALNET_WORKSPACE_ENV = "HARDKAS_TEST_LOCALNET_WORKSPACE";
const WORKSPACE_CONFIG = `export default {
  defaultNetwork: "simnet",
  networks: {
    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:${LOCALNET_RPC_PORT}", description: "the localnet level's own node" }
  }
};
`;

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function stopMiner(): void {
  if ((global as any)._minerInterval) {
    clearInterval((global as any)._minerInterval);
    (global as any)._minerInterval = undefined;
  }
}

export async function setup() {
  // This level starts its own simnet node and mines into it: it never attaches to, or mines into, a node it did not
  // start (a developer's localnet, a demo). A busy port is a failure, not an attachment.
  if (await portInUse(LOCALNET_RPC_PORT)) {
    throw new Error(
      `[GlobalSetup] LOCALNET_LEVEL_PORT_BUSY: 127.0.0.1:${LOCALNET_RPC_PORT} is already in use. The localnet level starts and mines its ` +
        `own simnet node and never mines into a node it did not start; stop the other node first.`
    );
  }
  console.log("Starting SimnetNodeHarness...");
  try {
    harness = await SimnetNodeHarness.start({
      rpcPort: LOCALNET_RPC_PORT,
      utxoIndex: true,
      startupTimeoutMs: 60000
    });
    console.log("SimnetNodeHarness started successfully.");
    console.log("Waiting for node to become ready...");
    await harness.waitUntilReady();
    console.log("Node is ready. Funding alice...");

    // The level's own workspace (REMED-CLOSE: never the repository root's .hardkas)
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hk-localnet-level-"));
    fs.mkdirSync(path.join(workspace, ".hardkas"));
    fs.writeFileSync(path.join(workspace, "hardkas.config.ts"), WORKSPACE_CONFIG, "utf8");
    process.env[LOCALNET_WORKSPACE_ENV] = workspace;
    process.env.HARDKAS_ROOT = workspace;
    // The level's tests sign as alice AND bob (W3): the five development identities are provisioned the way the
    // product provisions them (DEF-27), not only alice — bob used to resolve without a key (DEV_ACCOUNT_KEY_UNAVAILABLE).
    await ensureDevAccounts(workspace);
    // Fund alice
    const alice = await getOrCreateDevAccount(workspace, 0, "alice");
    // Matures alice's coinbase outputs without spamming her wallet: a simnet address of its own (kaspasim: prefix), from
    // a fixture key no test of this level uses.
    const k = loadManagedKaspaWasmSync();
    const burnerAddress = String(new k.PrivateKey(getHardkasFixtureKey("erin")).toPublicKey().toAddress("simnet").toString());

    // Wait for node to stabilize
    await new Promise(r => setTimeout(r, 2000));

    // Mine 50 blocks to Alice
    await harness.mining.mineBlocks(50, { payAddress: alice.address });
    // Mine 1000 blocks to burner address to mature Alice's UTXOs without spamming her wallet
    await harness.mining.mineBlocks(1000, { payAddress: burnerAddress });

    // Wait for UTXO index to catch up
    await new Promise(r => setTimeout(r, 2000));

    // Start a background miner so that transactions broadcast during tests get mined
    const minerInterval = setInterval(async () => {
      try {
        await harness.mining.mineBlocks(1, { payAddress: burnerAddress });
      } catch (e: any) {
        // Ignore minor miner conflicts in background
      }
    }, 3000);

    (global as any)._minerInterval = minerInterval;
  } catch (err: any) {
    // A failed setup leaves nothing running: no miner, no node (teardown does not run after a failed setup).
    stopMiner();
    if (harness) await harness.stop().catch(() => undefined);
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
    throw new Error(`[GlobalSetup] FATAL: Simnet node could not be started. Required for localnet tests: ${err.message}`);
  }

  const instance = createDevServer({
    port: 3000,
    host: "127.0.0.1",
    unsafeNoAuth: true
  });
  server = instance.start();
  if ((global as any)._minerInterval) {
    (server as any)._minerInterval = (global as any)._minerInterval;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function teardown() {
  stopHardkasWatcher();
  stopMiner();
  if (server) {
    if ((server as any)._minerInterval) clearInterval((server as any)._minerInterval);
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close();
  }
  if (harness) {
    await harness.stop();
  }
  if (workspace) fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
