import { describe, it, expect, vi } from "vitest";
import { DefaultReactiveEventProvider } from "../src/provider/reactive-event-provider.js";
import { SimulatedTransportAdapter } from "../src/adapters/simulated-transport.js";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("P3: Connection and State", () => {
  it("Connects and emits state changes", async () => {
    const transport = new SimulatedTransportAdapter();
    const provider = new DefaultReactiveEventProvider(transport);
    
    const states: string[] = [];
    provider.onConnectionState(evt => {
      states.push(evt.current);
    });
    
    await provider.connect();
    expect(states).toEqual(["connecting", "connected"]);
    
    await provider.close();
    expect(states).toEqual(["connecting", "connected", "closing", "closed"]);
  });

  it("Automatically reconnects on disconnect with backoff", async () => {
    const transport = new SimulatedTransportAdapter();
    const provider = new DefaultReactiveEventProvider(transport);
    
    const states: string[] = [];
    provider.onConnectionState(evt => {
      states.push(evt.current);
    });

    await provider.connect();
    expect(states).toContain("connected");

    // Simulate network drop
    transport.simulateDisconnect("Network error");
    
    // It should immediately transition to degraded/reconnecting
    expect(states).toContain("degraded");

    // Wait for backoff and reconnect
    await delay(150);
    expect(states[states.length - 1]).toBe("connected");
    
    await provider.close();
  });

  it("Isolates callback failures without crashing manager", async () => {
    const transport = new SimulatedTransportAdapter();
    const provider = new DefaultReactiveEventProvider(transport);
    
    provider.onConnectionState(() => {
      throw new Error("Consumer failed");
    });
    
    let reached = false;
    provider.onConnectionState(() => {
      reached = true;
    });

    await provider.connect();
    expect(reached).toBe(true); // The second listener still ran
    
    await provider.close();
  });
});
