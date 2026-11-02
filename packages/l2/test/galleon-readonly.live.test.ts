// LIVE, READ-ONLY check of the built-in Igra Galleon testnet profile.
// Never part of the hermetic gate: it runs only through `vitest.l2-live.config.ts` AND with
// TEST_IGRA_GALLEON=1. It performs JSON-RPC reads against Igra's public Galleon endpoint and no writes.
// It needs no Anvil and no Docker.
import { describe, it, expect, beforeAll } from "vitest";
import { EvmJsonRpcClient } from "../src/evm-rpc-client.js";
import { checkEvmRpcHealth } from "../src/evm-rpc-health.js";
import { getL2Profile } from "../src/registry.js";

const isGalleonEnabled = process.env.TEST_IGRA_GALLEON === "1";
const ZERO = "0x0000000000000000000000000000000000000000";

describe.runIf(isGalleonEnabled)("Live Igra Galleon Testnet (opt-in, read-only)", () => {
  let client: EvmJsonRpcClient;

  beforeAll(() => {
    client = new EvmJsonRpcClient({ profile: "igra-galleon" });
  });

  it("profile metadata: testnet, documented endpoint, not mainnet", () => {
    const p = getL2Profile("igra-galleon")!;
    expect(p.environment).toBe("testnet");
    expect(p.endpoint.status).toBe("documented");
    expect(client.expectedChainId).toBe(38836);
  });

  it("the endpoint serves chain 38836 (operational check of the documented value)", async () => {
    await expect(client.assertExpectedChainId()).resolves.toBe(38836);
  });

  it("basic reads return well-formed values", async () => {
    expect(await client.getBlockNumber()).toBeGreaterThan(0n);
    expect(await client.getGasPriceWei()).toBeGreaterThan(0n);
    expect(await client.getBalanceWei(ZERO)).toBeGreaterThanOrEqual(0n);
    expect(await client.getTransactionCount(ZERO)).toBeGreaterThanOrEqual(0n);
    expect(await client.getCode(ZERO)).toBe("0x");
    const latest = await client.getBlockNumber();
    const logs = await client.getLogs({ fromBlock: latest > 5n ? latest - 5n : 0n, toBlock: latest });
    expect(Array.isArray(logs)).toBe(true);
  });

  it("health check reports the profile chain", async () => {
    const health = await checkEvmRpcHealth({ profile: "igra-galleon" });
    expect(health.ready).toBe(true);
    expect(health.chainId).toBe(38836);
  });
});
