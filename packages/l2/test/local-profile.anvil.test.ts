// Requires a local Anvil (native binary, or Docker with the pinned image already present: no pulls).
// Runs only through `vitest.anvil.config.ts`, never in the hermetic gate.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveL2Profile } from "../src/registry.js";
import { EvmJsonRpcClient } from "../src/evm-rpc-client.js";
import { checkEvmRpcHealth } from "../src/evm-rpc-health.js";
import {
  startLocalEvmNode,
  type LocalEvmNodeHandle,
  sweepDanglingAnvilNodes
} from "./harness/local-evm-node.js";

describe("Local Development Profile (Anvil)", () => {
  let localNode: LocalEvmNodeHandle;

  beforeAll(async () => {
    localNode = await startLocalEvmNode({ silent: true });
  });

  afterAll(async () => {
    if (localNode) await localNode.stop();
    sweepDanglingAnvilNodes(); // this run's containers only
  });

  it("reads local profile correctly against live Anvil node", async () => {
    const localProfile = resolveL2Profile({
      name: "local",
      cliOverrides: { url: localNode.rpcUrl }
    });

    const client = new EvmJsonRpcClient({
      url: localProfile.rpcUrl!,
      profile: localProfile,
      timeoutMs: 10000
    });

    expect(await client.assertExpectedChainId()).toBe(31337);
    expect(await client.getBlockNumber()).toBeGreaterThanOrEqual(0n);
    expect(await client.getGasPriceWei()).toBeGreaterThan(0n);
    expect(
      await client.getBalanceWei("0x0000000000000000000000000000000000000000")
    ).toBe(0n);

    const health = await checkEvmRpcHealth({ url: localProfile.rpcUrl! });
    expect(health.ready).toBe(true);
    expect(health.chainId).toBe(31337);
  });
});
