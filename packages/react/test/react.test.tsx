import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, renderHook, waitFor } from "@testing-library/react";
import { HardKasProvider, useHardKas } from "../src/provider.js";
import { useHardKasSession } from "../src/hooks/session.js";
import { QueryClient } from "@tanstack/react-query";

// Mock global fetch
global.fetch = vi.fn();

// Mock EventSource
class MockEventSource {
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}
global.EventSource = MockEventSource as any;

describe("HardKas React", () => {
  const config = {
    kaspaRpcUrl: "http://localhost:16110",
    sessionName: "test-session"
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HardKasProvider renders children", () => {
    const { getByText } = render(
      <HardKasProvider config={config}>
        <div>Test Child</div>
      </HardKasProvider>
    );
    expect(getByText("Test Child")).toBeDefined();
  });

  it("useHardKas hook returns context", () => {
    const { result } = renderHook(() => useHardKas(), {
      wrapper: ({ children }) => <HardKasProvider config={config}>{children}</HardKasProvider>
    });
    expect(result.current.config.kaspaRpcUrl).toBe(config.kaspaRpcUrl);
    expect(result.current.igraClient).toBeDefined();
  });

  it("useHardKasSession fetches session from API", async () => {
    const mockSession = {
      name: "test-session",
      l1: { wallet: "alice", address: "addr1" },
      l2: { account: "alice-l2", address: "addr2" },
      bridge: { mode: "local-simulated" }
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ active: mockSession })
    });

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useHardKasSession(), {
      wrapper: ({ children }) => (
        <HardKasProvider config={config} queryClient={queryClient}>
          {children}
        </HardKasProvider>
      )
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("test-session");
    expect(result.current.data?.l1.wallet).toBe("alice");
  });

  it("hooks do not expose secret fields in results", async () => {
    const mockSession = {
      name: "test-session",
      l1: { wallet: "alice", address: "addr1" },
      l2: { account: "alice-l2", address: "addr2" },
      bridge: { mode: "local-simulated" },
      // Even if the server accidentally returned a secret (which it shouldn't)
      privateKey: "SECRET_KEY" 
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ active: mockSession })
    });

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useHardKasSession(), {
      wrapper: ({ children }) => (
        <HardKasProvider config={config} queryClient={queryClient}>
          {children}
        </HardKasProvider>
      )
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const dataStr = JSON.stringify(result.current.data);
    expect(dataStr).not.toContain("SECRET_KEY");
  });
});
