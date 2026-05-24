// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, screen, act } from "@testing-library/react";
import React from "react";
import { HardKasProvider, useHardKas } from "../src/provider.js";

function TestComponent({ onEvent }: { onEvent?: any }) {
  const { sseStatus, subscribe } = useHardKas();
  
  React.useEffect(() => {
    if (onEvent) return subscribe(onEvent);
  }, [subscribe, onEvent]);

  return <div data-testid="status">{sseStatus}</div>;
}

function ProjectionTestComponent({ onEvent }: { onEvent?: any }) {
  const { sseStatus, projectionStatus, generationId, apiFetch, subscribe } = useHardKas();
  
  React.useEffect(() => {
    if (onEvent) return subscribe(onEvent);
  }, [subscribe, onEvent]);

  return (
    <div>
      <div data-testid="status">{sseStatus}</div>
      <div data-testid="projection">{projectionStatus}</div>
      <div data-testid="generation">{generationId || "null"}</div>
      <button data-testid="fetch-btn" onClick={() => apiFetch("http://localhost:7420/api/health")}>Fetch</button>
    </div>
  );
}

describe("HardKas SSE & Reconnect", () => {
  let MockEventSource: any;

  beforeEach(() => {
    vi.useFakeTimers();
    
    MockEventSource = vi.fn().mockImplementation(function(this: any, url: string) {
      this.url = url;
      this.onopen = null;
      this.onerror = null;
      this.onmessage = null;
      this.readyState = 0;
      this.listeners = {};
      this.addEventListener = vi.fn((type: string, cb: any) => {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
      });
      this.removeEventListener = vi.fn();
      this.close = vi.fn();
      this.emit = (type: string, data: any) => {
        const event = { data: JSON.stringify(data) };
        if (type === "message" && this.onmessage) this.onmessage(event);
        if (this.listeners[type]) {
          this.listeners[type].forEach((l: any) => l(event));
        }
      };
      this.emitError = () => {
        if (this.onerror) this.onerror();
      };

      setTimeout(() => {
        if (this.onopen) this.onopen();
      }, 10);
    });

    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates only one EventSource for multiple components", async () => {
    render(
      <HardKasProvider config={{ localOnly: true, devServerUrl: "http://localhost:7420" }}>
        <TestComponent />
        <TestComponent />
      </HardKasProvider>
    );

    expect(MockEventSource).toHaveBeenCalledTimes(1);
  });

  it("transitions through connection states", async () => {
    render(
      <HardKasProvider config={{ localOnly: true, devServerUrl: "http://localhost:7420" }}>
        <TestComponent />
      </HardKasProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("connecting");
    
    // Advance timers for the MockEventSource constructor setTimeout
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    
    expect(screen.getByTestId("status").textContent).toBe("connected");
  });

  it("reconnects on error with exponential backoff", async () => {
    render(
      <HardKasProvider config={{ localOnly: true, devServerUrl: "http://localhost:7420" }}>
        <TestComponent />
      </HardKasProvider>
    );

    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(screen.getByTestId("status").textContent).toBe("connected");
    
    const firstEs = MockEventSource.mock.instances[0] as any;
    
    // Trigger error
    await act(async () => {
      firstEs.emitError();
    });
    expect(screen.getByTestId("status").textContent).toBe("reconnecting");

    // Wait for backoff (500ms)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(MockEventSource).toHaveBeenCalledTimes(2);

    const secondEs = MockEventSource.mock.instances[1] as any;
    await act(async () => {
      vi.advanceTimersByTime(20); // for onopen
    });
    expect(screen.getByTestId("status").textContent).toBe("connected");
    
    await act(async () => {
      secondEs.emitError();
    });
    expect(screen.getByTestId("status").textContent).toBe("reconnecting");
    
    // Wait for backoff (1000ms)
    await act(async () => {
      vi.advanceTimersByTime(1010);
    });
    expect(MockEventSource).toHaveBeenCalledTimes(3);
  });

  it("cleans up on unmount", () => {
    const { unmount } = render(
      <HardKasProvider config={{ localOnly: true, devServerUrl: "http://localhost:7420" }}>
        <TestComponent />
      </HardKasProvider>
    );

    const esInstance = MockEventSource.mock.instances[0] as any;
    unmount();
    expect(esInstance.close).toHaveBeenCalled();
  });

  it("handles projection-stale and projection-synced SSE events", async () => {
    render(
      <HardKasProvider config={{ localOnly: true, devServerUrl: "http://localhost:7420" }}>
        <ProjectionTestComponent />
      </HardKasProvider>
    );

    // Initial state
    expect(screen.getByTestId("projection").textContent).toBe("synced");

    // Advance to connected
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    const esInstance = MockEventSource.mock.instances[0] as any;
    
    // Emit projection-stale
    await act(async () => {
      esInstance.emit("projection-stale", { timestamp: Date.now() });
    });
    
    expect(screen.getByTestId("projection").textContent).toBe("stale");

    // Emit projection-synced
    await act(async () => {
      esInstance.emit("projection-synced", { timestamp: Date.now(), generationId: "gen-123" });
    });
    
    expect(screen.getByTestId("projection").textContent).toBe("synced");
    expect(screen.getByTestId("generation").textContent).toBe("gen-123");
  });

  it("updates generationId on apiFetch with newer X-Hardkas-Generation", async () => {
    vi.useRealTimers();
    const globalFetch = vi.fn().mockResolvedValue({
      headers: {
        get: (key: string) => key === "X-Hardkas-Generation" ? "gen-999" : null
      }
    });
    vi.stubGlobal("fetch", globalFetch);

    render(
      <HardKasProvider config={{ localOnly: true, devServerUrl: "http://localhost:7420" }}>
        <ProjectionTestComponent />
      </HardKasProvider>
    );

    expect(screen.getByTestId("generation").textContent).toBe("null");

    await act(async () => {
      screen.getByTestId("fetch-btn").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("generation").textContent).toBe("gen-999");
    });
  });
});
