import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hardkas } from "@hardkas/sdk";

// These E2E tests actually spin up a docker container, so they require docker to be available.
// In CI environments where docker is missing, they should fail gracefully or be skipped, 
// but we expect Docker in HardKAS development.
describe("Programmatic Node Management (E2E)", () => {
  let sdk: Hardkas;
  let devWallet1 = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
  let devWallet2 = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";

  let isDockerAvailable = true;

  beforeAll(async () => {
    try {
      const { execSync } = require("child_process");
      execSync("docker info", { stdio: "ignore" });
    } catch (e) {
      isDockerAvailable = false;
      console.warn("Docker is not available. Skipping E2E node tests.");
      return;
    }
    sdk = await Hardkas.open({
      cwd: process.cwd(),
      network: "simnet"
    });
    // Ensure any dangling node is stopped and reset
    await sdk.node.reset();
  });

  afterAll(async () => {
    if (sdk && isDockerAvailable) {
      try {
        await sdk.node.reset();
      } catch (e) {
        console.warn("Failed to reset node in afterAll:", e);
      }
    }
  });

  it("should fail gracefully if trying to start on mainnet", async (ctx) => {
    if (!isDockerAvailable) return ctx.skip();
    const mainnetSdk = await Hardkas.open({
      cwd: process.cwd(),
      network: "mainnet",
      policy: { allowPublic: true }
    });

    await expect(mainnetSdk.node.start()).rejects.toThrow(
      "[NODE_MANAGEMENT_MAINNET_FORBIDDEN]"
    );
  });

  it("should report offline status initially", async (ctx) => {
    if (!isDockerAvailable) return ctx.skip();
    const status = await sdk.node.status();
    expect(status.running).toBe(false);
  });

  // Skip the actual docker spin-up test if we just want to run unit tests
  // We'll mark it as `it.skip` if the user wants purely fast tests, but here we run it
  // and we give it a large timeout.
  it("should spin up a node, mine to an address, and fund wallets", async (ctx) => {
    if (!isDockerAvailable) return ctx.skip();
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

  it("should be able to stop and reset the node", async (ctx) => {
    if (!isDockerAvailable) return ctx.skip();
    let status = await sdk.node.stop();
    expect(status.running).toBe(false);

    status = await sdk.node.reset();
    expect(status.running).toBe(false);
  }, 180000);
});
