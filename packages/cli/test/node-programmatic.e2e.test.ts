import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "@hardkas/sdk";

// These E2E tests start, mine on, stop and reset the CANONICAL localnet node of the Docker engine they reach (container
// hardkas-kaspad-toccata-v2, its miner and its data): run them only on a disposable engine, never on one that holds a
// localnet someone uses. HARDKAS_TEST_E2E_NODE_MANAGEMENT=run runs them, =skip skips them explicitly (reported as
// skipped). Unset, the suite FAILS (E2E_NODE_MANAGEMENT_UNCONFIRMED), and with Docker unreachable it FAILS
// (DOCKER_UNAVAILABLE): it never passes by omission. Its workspace is a temporary directory of its own (an initialized
// .hardkas, a simnet configuration): nothing at the repository root is needed or written.
const MODE = process.env.HARDKAS_TEST_E2E_NODE_MANAGEMENT ?? "";
const WORKSPACE_CONFIG = `export default {
  defaultNetwork: "simnet",
  networks: {
    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:18210", description: "the canonical localnet node (e2e)" }
  }
};
`;

describe.skipIf(MODE === "skip")("Programmatic Node Management (E2E)", () => {
  let sdk: Hardkas;
  let workspace: string | undefined;
  let devWallet1 = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
  let devWallet2 = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";

  beforeAll(async () => {
    if (MODE !== "run") {
      throw new Error(
        "E2E_NODE_MANAGEMENT_UNCONFIRMED: this suite resets the canonical localnet of the Docker engine it reaches. Set " +
          "HARDKAS_TEST_E2E_NODE_MANAGEMENT=run on a disposable engine, or =skip to skip it explicitly."
      );
    }
    try {
      execSync("docker info", { stdio: "ignore" });
    } catch {
      throw new Error("DOCKER_UNAVAILABLE: the node management E2E needs a reachable Docker engine (HARDKAS_TEST_E2E_NODE_MANAGEMENT=run).");
    }
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hk-e2e-node-"));
    fs.mkdirSync(path.join(workspace, ".hardkas"));
    fs.writeFileSync(path.join(workspace, "hardkas.config.ts"), WORKSPACE_CONFIG, "utf8");
    sdk = await Hardkas.open({
      cwd: workspace,
      network: "simnet"
    });
    // Ensure any dangling node is stopped and reset
    await sdk.node.reset();
  });

  afterAll(async () => {
    if (sdk) {
      try {
        await sdk.node.reset();
      } catch (e) {
        console.warn("Failed to reset node in afterAll:", e);
      }
    }
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("should fail gracefully if trying to start on mainnet", async () => {
    const mainnetSdk = await Hardkas.open({
      cwd: workspace!,
      network: "mainnet",
      policy: { allowPublic: true }
    });

    await expect(mainnetSdk.node.start()).rejects.toThrow(
      "[NODE_MANAGEMENT_MAINNET_FORBIDDEN]"
    );
  });

  it("should report offline status initially", async () => {
    const status = await sdk.node.status();
    expect(status.running).toBe(false);
  });

  // We give it a large timeout: docker pull + start + mining.
  it("should spin up a node, mine to an address, and fund wallets", async () => {
    // This starts the node with the CPU miner targeting devWallet1
    await sdk.node.fundDevWallets([devWallet1, devWallet2]);

    const status = await sdk.node.status();
    expect(status.running).toBe(true);

    const balance1 = await sdk.rpc.getBalanceByAddress(devWallet1);
    expect(balance1.balanceSompi > 0n).toBe(true);

    // We could do an actual transfer to devWallet2 here, but P78 just requires the
    // API structure for now.

    const logs = await sdk.node.logs({ tail: 10 });
    expect(logs).toBeDefined();
    expect(typeof logs).toBe("string");
  }, 120000); // 120s timeout for docker pull + start + mining

  it("should be able to stop and reset the node", async () => {
    let status = await sdk.node.stop();
    expect(status.running).toBe(false);

    status = await sdk.node.reset();
    expect(status.running).toBe(false);
  }, 180000);
});
