import { describe, it, expect } from "vitest";
import { DefaultReactiveEventProvider } from "../src/provider/reactive-event-provider.js";
import { SimulatedTransportAdapter } from "../src/adapters/simulated-transport.js";
import { EventEnvelope } from "../contracts/events.js";

describe("P3: Reconciliation and Deduplication", () => {
  it("Deduplicates events with the same ID", async () => {
    const transport = new SimulatedTransportAdapter();
    const provider = new DefaultReactiveEventProvider(transport);
    await provider.connect();

    let count = 0;
    await provider.subscribe({ type: "blockAdded" }, () => {
      count++;
    });

    const envelope: EventEnvelope<any> = {
      id: "ev_dup",
      type: "blockAdded",
      subscriptionId: "",
      metadata: { observedAt: Date.now(), source: "live" },
      payload: { hash: "block_1", daaScore: 100n }
    };

    // Send the same event 3 times
    transport.simulateMessage(envelope);
    transport.simulateMessage(envelope);
    transport.simulateMessage(envelope);
    
    // Only processed once
    expect(count).toBe(1);

    await provider.close();
  });
  
  it("Scope filtering works for utxo events", async () => {
    const transport = new SimulatedTransportAdapter();
    const provider = new DefaultReactiveEventProvider(transport);
    await provider.connect();

    let count = 0;
    await provider.subscribe({ type: "utxosChanged", addresses: ["kaspa:myaddr"] }, () => {
      count++;
    });

    // Send event matching the address
    transport.simulateMessage({
      id: "ev_utxo_1",
      type: "utxosChanged",
      subscriptionId: "",
      metadata: { observedAt: Date.now(), source: "live" },
      payload: {
        added: [{ scriptPublicKey: { scriptPublicKey: "kaspa:myaddr" } }],
        removed: []
      }
    });

    // Send event NOT matching the address
    transport.simulateMessage({
      id: "ev_utxo_2",
      type: "utxosChanged",
      subscriptionId: "",
      metadata: { observedAt: Date.now(), source: "live" },
      payload: {
        added: [{ scriptPublicKey: { scriptPublicKey: "kaspa:other" } }],
        removed: []
      }
    });

    // Only the matched one
    expect(count).toBe(1);

    await provider.close();
  });
});
