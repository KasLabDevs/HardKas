import { ConnectionStatus, ConnectionStateChangedEvent } from "../contracts/events.js";
import { TransportAdapter } from "../contracts/transport.js";
type StateChangeHandler = (event: ConnectionStateChangedEvent) => void;
export declare class SubscriptionManager {
    private transport;
    private onResubscribe;
    private status;
    private backoff;
    private stateListeners;
    private reconnectTimer?;
    private abortController?;
    private cleanupFns;
    constructor(transport: TransportAdapter, onResubscribe: () => Promise<void>);
    getStatus(): ConnectionStatus;
    onStateChange(handler: StateChangeHandler): () => void;
    private transition;
    connect(): Promise<void>;
    private doConnect;
    private handleDisconnect;
    private handleConnectFailure;
    private scheduleReconnect;
    close(): Promise<void>;
    private clearCleanupFns;
}
export {};
//# sourceMappingURL=subscription-manager.d.ts.map