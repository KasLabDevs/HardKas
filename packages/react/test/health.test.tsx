// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { HardKasProvider } from "../src/provider.js";
import { useHardKasHealth } from "../src/hooks/health.js";
import { QueryClient } from "@tanstack/react-query";

// Mock fetch
const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

// Mock EventSource for Provider
const MockES = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  onopen: null,
  onerror: null,
  onmessage: null,
}));
Object.defineProperty(window, "EventSource", {
  value: MockES,
  configurable: true,
  writable: true
});

describe("useHardKasHealth", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          retryDelay: 0,
        },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HardKasProvider config={{ localOnly: true, devServerUrl: "http://localhost:7420" }} queryClient={queryClient}>
      {children}
    </HardKasProvider>
  );

  it("fetches health data successfully", async () => {
    const mockHealth = {
      status: "ok",
      l1: { status: "ok", networkId: "simnet-1", daaScore: 1000, rpcUrl: "rpc1" },
      l2: { status: "ok", chainId: 19416, blockHeight: 500, rpcUrl: "rpc2" }
    };

    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockHealth
    });

    const { result } = renderHook(() => useHardKasHealth(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockHealth);
  });

  it("handles fetch errors", async () => {
    globalFetch.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useHardKasHealth(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
  });
});
