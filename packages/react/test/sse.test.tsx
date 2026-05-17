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
});
