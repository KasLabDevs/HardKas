import { DeterministicBackoff } from "./backoff.js";
export class SubscriptionManager {
    transport;
    onResubscribe;
    status = "idle";
    backoff;
    stateListeners = new Set();
    reconnectTimer;
    abortController;
    cleanupFns = [];
    constructor(transport, onResubscribe) {
        this.transport = transport;
        this.onResubscribe = onResubscribe;
        this.backoff = new DeterministicBackoff({
            initialDelayMs: 100,
            maxDelayMs: 10000,
            factor: 2
        });
    }
    getStatus() {
        return this.status;
    }
    onStateChange(handler) {
        this.stateListeners.add(handler);
        return () => this.stateListeners.delete(handler);
    }
    transition(newStatus, reason, retryInMs) {
        if (this.status === newStatus)
            return;
        const event = {
            previous: this.status,
            current: newStatus,
            attempt: this.backoff.attempt,
            retryInMs,
            reason
        };
        this.status = newStatus;
        // Safely emit to all listeners without throwing if one fails
        for (const listener of this.stateListeners) {
            try {
                listener(event);
            }
            catch (err) {
                console.error("SubscriptionManager: state listener threw error", err);
            }
        }
    }
    async connect() {
        if (this.status === "connected" || this.status === "connecting" || this.status === "reconnecting") {
            return;
        }
        this.abortController = new AbortController();
        this.transition("connecting");
        this.backoff.reset();
        await this.doConnect();
    }
    async doConnect() {
        try {
            await this.transport.connect(this.abortController?.signal);
            this.transition("connected");
            this.backoff.reset();
            this.cleanupFns.push(this.transport.onDisconnect((reason) => {
                this.handleDisconnect(reason);
            }));
            // Resubscribe active scopes and trigger reconciliation
            await this.onResubscribe();
        }
        catch (err) {
            this.handleConnectFailure(err.message || "Connection failed");
        }
    }
    handleDisconnect(reason) {
        if (this.status === "closing" || this.status === "closed")
            return;
        this.clearCleanupFns();
        this.scheduleReconnect(String(reason));
    }
    handleConnectFailure(reason) {
        if (this.status === "closing" || this.status === "closed")
            return;
        this.scheduleReconnect(reason);
    }
    scheduleReconnect(reason) {
        const delay = this.backoff.nextDelay();
        if (delay === undefined) {
            this.transition("failed", "Max reconnect attempts reached");
            return;
        }
        this.transition(this.status === "connected" ? "degraded" : "reconnecting", reason, delay);
        this.reconnectTimer = setTimeout(() => {
            this.doConnect();
        }, delay);
    }
    async close() {
        this.transition("closing", "Explicit close requested");
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = undefined;
        }
        this.clearCleanupFns();
        try {
            await this.transport.disconnect();
        }
        catch (err) {
            // Ignore disconnect errors during close
        }
        this.transition("closed");
    }
    clearCleanupFns() {
        for (const fn of this.cleanupFns) {
            try {
                fn();
            }
            catch (e) { }
        }
        this.cleanupFns = [];
    }
}
//# sourceMappingURL=subscription-manager.js.map