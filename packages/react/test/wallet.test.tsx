import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { HardKasProvider, useHardKas } from "../src/provider.js";
import { useIgraAccount, useIgraWallet } from "../src/hooks/igra.js";
import { useIgraWriteContract } from "../src/hooks/contracts.js";
import { QueryClient } from "@tanstack/react-query";

// Mock EventSource
class MockEventSource {
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}
global.EventSource = MockEventSource as any;

describe("HardKas React Wallet Integration (EIP-6963)", () => {
  let queryClient: QueryClient;
  const config = {
    kaspaRpcUrl: "http://localhost:16110",
    sessionName: "test-session"
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });
    vi.clearAllMocks();
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should discover injected wallets via EIP-6963 announce events", async () => {
    const { result } = renderHook(() => useHardKas(), {
      wrapper: ({ children }) => (
        <HardKasProvider config={config} queryClient={queryClient}>
          {children}
        </HardKasProvider>
      )
    });

    const mockProvider = {
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn()
    };

    const announceEvent = new Event("eip6963:announceProvider");
    (announceEvent as any).detail = {
      info: {
        uuid: "mock-uuid-1",
        name: "MetaMask Mock",
        icon: "mock-icon-1",
        rdns: "io.metamask.mock"
      },
      provider: mockProvider
    };

    act(() => {
      window.dispatchEvent(announceEvent);
    });

    expect(result.current.providers.length).toBe(1);
    expect(result.current.providers[0]?.info.name).toBe("MetaMask Mock");
    expect(result.current.providers[0]?.info.rdns).toBe("io.metamask.mock");
  });

  it("should connect wallet, query account details, set chainId, and persist to localStorage", async () => {
    const { result } = renderHook(() => useIgraWallet(), {
      wrapper: ({ children }) => (
        <HardKasProvider config={config} queryClient={queryClient}>
          {children}
        </HardKasProvider>
      )
    });

    const mockProvider = {
      request: vi.fn().mockImplementation(async (args) => {
        if (args.method === "eth_requestAccounts") {
          return ["0xAddress123"];
        }
        if (args.method === "eth_chainId") {
          return "0x4bd8"; // 19416 (Igra Local Chain ID)
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn()
    };

    const providerDetail = {
      info: {
        uuid: "mock-uuid-2",
        name: "Rabby Mock",
        icon: "mock-icon-2",
        rdns: "io.rabby.mock"
      },
      provider: mockProvider
    };

    await act(async () => {
      await result.current.connectWallet(providerDetail);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.walletAddress).toBe("0xAddress123");
    expect(result.current.walletChainId).toBe(19416);
    expect(result.current.activeProvider?.info.rdns).toBe("io.rabby.mock");
    expect(window.localStorage.getItem("hardkas:active-wallet")).toBe("io.rabby.mock");
  });

  it("should fall back to local dev session L2 account when no browser wallet is connected", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          active: {
            name: "test-session",
            l1: { wallet: "alice", address: "addr1" },
            l2: { account: "alice-l2", address: "0xLocalDevAddress" },
            bridge: { mode: "local-simulated" }
          }
        })
      )
    );

    const { result } = renderHook(() => useIgraAccount(), {
      wrapper: ({ children }) => (
        <HardKasProvider config={config} queryClient={queryClient}>
          {children}
        </HardKasProvider>
      )
    });

    // Before wallet connects, it falls back to local dev active session
    await waitFor(() => expect(result.current.address).toBe("0xLocalDevAddress"));
    expect(result.current.name).toBe("alice-l2");
    expect(result.current.isWallet).toBe(false);
  });

  it("should auto-bind walletClient inside useIgraWriteContract", async () => {
    const mockProvider = {
      request: vi.fn().mockImplementation(async (args) => {
        if (args.method === "eth_requestAccounts") {
          return ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
        }
        if (args.method === "eth_chainId") {
          return "0x4bd8";
        }
        if (args.method === "eth_sendTransaction") {
          return "0x56a4cf8a487c674254b1f64ff477fb47781b0a880026e6a88026e6a88026e6aa";
        }
        return null;
      }),
      on: vi.fn(),
      removeListener: vi.fn()
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HardKasProvider config={config} queryClient={queryClient}>
        {children}
      </HardKasProvider>
    );

    // Using single renderHook to share context value
    const { result } = renderHook(
      () => {
        const wallet = useIgraWallet();
        const write = useIgraWriteContract();
        return { wallet, write };
      },
      { wrapper }
    );

    const providerDetail = {
      info: { uuid: "uid", name: "Meta", icon: "ico", rdns: "io.meta" },
      provider: mockProvider
    };

    // 1. Connect wallet
    await act(async () => {
      await result.current.wallet.connectWallet(providerDetail);
    });

    // 2. Call contract writing without explicitly passing a walletClient
    await act(async () => {
      await result.current.write.mutateAsync({
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        abi: [
          {
            name: "mint",
            type: "function",
            stateMutability: "nonpayable",
            inputs: [{ name: "amount", type: "uint256" }],
            outputs: []
          }
        ],
        functionName: "mint",
        args: [100n]
      });
    });

    // 3. Verify that the underlying provider's request was invoked with eth_sendTransaction
    expect(mockProvider.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "eth_sendTransaction"
      })
    );
  });
});
