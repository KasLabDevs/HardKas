import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  startLocalEvmNode,
  type LocalEvmNodeHandle,
  ANVIL_CHAIN_ID,
  ANVIL_TEST_ACCOUNTS,
  sweepDanglingAnvilNodes
} from "../../l2/test/harness/local-evm-node.js";
import { runL2RpcChainId, runL2RpcGasPrice } from "../src/runners/l2-rpc-query-runners.js";
import { runL2Balance, runL2Nonce } from "../src/runners/l2-account-runners.js";
import { runL2ProfileShow } from "../src/runners/l2-profile-show-runner.js";
import { runL2Networks } from "../src/runners/l2-networks-runner.js";

describe("Phase 3: CLI L2 Commands against Live Anvil Node (No Mocks)", () => {
  let node: LocalEvmNodeHandle;

  beforeAll(async () => {
    sweepDanglingAnvilNodes();
    node = await startLocalEvmNode({ startupTimeoutMs: 15000 });
  }, 20000);

  afterAll(async () => {
    if (node) {
      await node.stop();
    }
    sweepDanglingAnvilNodes();
  });

  it("runL2RpcChainId outputs accurate chainId from real node", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(msg);
    });

    try {
      await runL2RpcChainId({
        network: "local",
        url: node.rpcUrl,
        json: true
      });

      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(parsed.chainId).toBe(ANVIL_CHAIN_ID);
      expect(parsed.networkId).toBe("local");
    } finally {
      spy.mockRestore();
    }
  });

  it("runL2RpcGasPrice outputs non-zero gas price from real node", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(msg);
    });

    try {
      await runL2RpcGasPrice({
        network: "local",
        url: node.rpcUrl,
        json: true
      });

      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(BigInt(parsed.gasPrice) > 0n).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("runL2Balance outputs funded balance for lab account", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(msg);
    });

    try {
      await runL2Balance(ANVIL_TEST_ACCOUNTS[0]!.address, {
        network: "local",
        url: node.rpcUrl,
        json: true
      });

      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(parsed.address.toLowerCase()).toBe(
        ANVIL_TEST_ACCOUNTS[0]!.address.toLowerCase()
      );
      expect(BigInt(parsed.balanceWei)).toBe(10000000000000000000000n);
    } finally {
      spy.mockRestore();
    }
  });

  it("runL2Nonce outputs valid nonce for lab account", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(msg);
    });

    try {
      await runL2Nonce(ANVIL_TEST_ACCOUNTS[0]!.address, {
        network: "local",
        url: node.rpcUrl,
        json: true
      });

      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(typeof parsed.nonce).toBe("string");
      expect(BigInt(parsed.nonce) >= 0n).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("runL2ProfileShow displays the local network profile", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(msg);
    });

    try {
      await runL2ProfileShow({
        name: "local",
        json: true
      });

      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(parsed.name).toBe("local");
      expect(parsed.chainId).toBe(31337);
      expect(parsed.security.riskProfile).toBe("low");
    } finally {
      spy.mockRestore();
    }
  });

  it("runL2Networks lists all registered profiles", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => {
      logs.push(msg);
    });

    try {
      await runL2Networks({ json: true });

      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.some((p: any) => p.name === "local")).toBe(true);
      expect(parsed.some((p: any) => p.name === "igra-galleon")).toBe(true);
      expect(parsed.some((p: any) => p.name === "igra")).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
