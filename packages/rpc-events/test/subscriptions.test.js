import { describe, it, expect } from "vitest";
import { DefaultReactiveEventProvider } from "../src/provider/reactive-event-provider.js";
import { SimulatedTransportAdapter } from "../src/adapters/simulated-transport.js";
describe("P3: Subscriptions and Re-subscriptions", () => {
    it("Dispatches events correctly to subscribers", async () => {
        const transport = new SimulatedTransportAdapter();
        const provider = new DefaultReactiveEventProvider(transport);
        await provider.connect();
        const received = [];
        await provider.subscribe({ type: "blockAdded" }, (evt) => {
            received.push(evt.payload);
        });
        const envelope = {
            id: "ev_1",
            type: "blockAdded",
            subscriptionId: "",
            metadata: { observedAt: Date.now(), source: "live" },
            payload: { hash: "block_1", daaScore: 100n }
        };
        transport.simulateMessage(envelope);
        expect(received.length).toBe(1);
        expect(received[0].hash).toBe("block_1");
        await provider.close();
    });
    it("Automatically resubscribes after a reconnect", async () => {
        const transport = new SimulatedTransportAdapter();
        const provider = new DefaultReactiveEventProvider(transport);
        await provider.connect();
        await provider.subscribe({ type: "blockAdded" }, () => { });
        expect(transport.getActiveRemoteSubscriptionsCount()).toBe(1);
        // Drop connection
        transport.simulateDisconnect("Dropped");
        expect(transport.getActiveRemoteSubscriptionsCount()).toBe(0);
        // Wait for auto-reconnect
        await new Promise(r => setTimeout(r, 200));
        // It should have resubscribed
        expect(transport.getActiveRemoteSubscriptionsCount()).toBe(1);
        await provider.close();
    });
    it("Unsubscribe cleans up remote subscription", async () => {
        const transport = new SimulatedTransportAdapter();
        const provider = new DefaultReactiveEventProvider(transport);
        await provider.connect();
        const sub = await provider.subscribe({ type: "blockAdded" }, () => { });
        expect(transport.getActiveRemoteSubscriptionsCount()).toBe(1);
        await sub.unsubscribe();
        expect(transport.getActiveRemoteSubscriptionsCount()).toBe(0);
        await provider.close();
    });
});
//# sourceMappingURL=subscriptions.test.js.map