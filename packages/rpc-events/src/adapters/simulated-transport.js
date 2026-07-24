let subCounter = 0;
export class SimulatedTransportAdapter {
    id = "simulated-transport";
    capabilities = {
        supportsHeartbeat: true,
        supportsReplay: false,
        supportsServerSubscriptions: true
    };
    connected = false;
    messageHandlers = new Set();
    disconnectHandlers = new Set();
    activeSubscriptions = new Map();
    failConnect = false;
    connectDelay = 10;
    async connect(signal) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.failConnect) {
                    reject(new Error("Simulated connection failure"));
                }
                else {
                    this.connected = true;
                    resolve();
                }
            }, this.connectDelay);
            if (signal) {
                signal.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(new Error("Aborted"));
                });
            }
        });
    }
    async disconnect() {
        this.connected = false;
        this.activeSubscriptions.clear();
    }
    simulateDisconnect(reason) {
        this.connected = false;
        this.activeSubscriptions.clear();
        for (const h of this.disconnectHandlers) {
            h(reason);
        }
    }
    simulateMessage(envelope) {
        if (!this.connected)
            return;
        for (const h of this.messageHandlers) {
            h(envelope);
        }
    }
    async subscribe(request) {
        if (!this.connected)
            throw new Error("Not connected");
        const id = `remote_sub_${++subCounter}`;
        this.activeSubscriptions.set(id, request);
        return id;
    }
    async unsubscribe(subscription) {
        this.activeSubscriptions.delete(subscription);
    }
    onMessage(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }
    onDisconnect(handler) {
        this.disconnectHandlers.add(handler);
        return () => this.disconnectHandlers.delete(handler);
    }
    getActiveRemoteSubscriptionsCount() {
        return this.activeSubscriptions.size;
    }
}
//# sourceMappingURL=simulated-transport.js.map