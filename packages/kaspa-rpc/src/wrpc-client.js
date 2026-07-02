// SAFETY_LEVEL: SIMULATION_ONLY
//
// Kaspa wRPC client for JSON wRPC over WebSocket.
// Connects to rusty-kaspad port 18210 (simnet) / 18110 (mainnet).
//
// IMPORTANT: The wRPC JSON envelope format has been verified against
// rusty-kaspad v1.1.0. If the format changes, this client must be updated.
import WebSocket from "ws";
import { logger, metrics } from "@hardkas/observability";
metrics.register({
    name: "rpc_requests_total",
    help: "Total RPC requests made",
    type: "counter"
});
metrics.register({
    name: "rpc_errors_total",
    help: "Total RPC requests failed",
    type: "counter"
});
metrics.register({
    name: "rpc_retries_total",
    help: "Total RPC requests retried",
    type: "counter"
});
export class KaspaWrpcClient {
    url;
    ws = null;
    requestId = 0;
    pending = new Map();
    onNotification;
    debug = false;
    constructor(url) {
        // Normalize URL to ws:// or wss://
        if (url.startsWith("http://")) {
            this.url = url.replace("http://", "ws://");
        }
        else if (url.startsWith("https://")) {
            this.url = url.replace("https://", "wss://");
        }
        else if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
            this.url = `ws://${url}`;
        }
        else {
            this.url = url;
        }
    }
    getUrl() {
        return this.url;
    }
    async connect(timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.disconnect();
                reject(new Error(`WebSocket connection timeout after ${timeoutMs}ms to ${this.url}`));
            }, timeoutMs);
            try {
                this.ws = new WebSocket(this.url);
            }
            catch (err) {
                clearTimeout(timer);
                reject(new Error(`Failed to create WebSocket to ${this.url}: ${err}`));
                return;
            }
            this.ws.on("open", () => {
                clearTimeout(timer);
                resolve();
            });
            this.ws.on("error", (err) => {
                clearTimeout(timer);
                reject(new Error(`WebSocket error: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`));
            });
            this.ws.on("message", (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.id !== undefined) {
                        const pending = this.pending.get(response.id);
                        if (pending) {
                            clearTimeout(pending.timer);
                            this.pending.delete(response.id);
                            pending.resolve(response);
                        }
                    }
                    else {
                        // Notification or non-correlated message from server
                        if (this.onNotification) {
                            this.onNotification(response);
                        }
                    }
                }
                catch (parseErr) {
                    // Non-JSON message — log in debug mode
                    if (this.debug) {
                        console.debug("[wRPC] Non-JSON message received:", data.toString().slice(0, 200));
                    }
                }
            });
            this.ws.on("close", () => {
                for (const [, pending] of this.pending) {
                    clearTimeout(pending.timer);
                    pending.reject(new Error("WebSocket closed"));
                }
                this.pending.clear();
            });
        });
    }
    async request(method, params, timeoutMs = 5000) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected. Call connect() first.");
        }
        metrics.inc("rpc_requests_total", { method });
        logger.trace("wRPC request", { method, params });
        const id = ++this.requestId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`wRPC timeout: ${method} (${timeoutMs}ms)`));
            }, timeoutMs);
            this.pending.set(id, {
                resolve: (response) => {
                    if (response.error) {
                        const errMsg = response.error.message ||
                            `wRPC error code ${response.error.code || "unknown"}`;
                        metrics.inc("rpc_errors_total", { method });
                        logger.error("wRPC error response", { method, error: errMsg });
                        reject(new Error(errMsg));
                    }
                    else {
                        resolve(response.result !== undefined ? response.result : response.params);
                    }
                },
                reject: (err) => {
                    metrics.inc("rpc_errors_total", { method });
                    logger.error("wRPC rejected", { method, error: err.message });
                    reject(err);
                },
                timer
            });
            // Envelope format verified against rusty-kaspad v1.1.0
            this.ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
    }
    async getServerInfo() {
        return this.request("getServerInfo");
    }
    async getBlockDagInfo() {
        return this.request("getBlockDagInfo");
    }
    async getVirtualSelectedParentBlueScore() {
        return this.request("getVirtualSelectedParentBlueScore");
    }
    async getUtxosByAddresses(addresses) {
        return this.request("getUtxosByAddresses", { addresses });
    }
    async submitTransaction(txPayload, allowOrphan = false) {
        let tx = typeof txPayload === "string"
            ? JSON.parse(txPayload)
            : JSON.parse(JSON.stringify(txPayload, (k, v) => typeof v === 'bigint' ? v.toString() : v));
        // Construct exactly what Kaspad expects, discarding extra fields
        const normalizedTx = {
            version: Number(tx.version || 0),
            inputs: (tx.inputs || []).map((i) => {
                const inp = {
                    previousOutpoint: {
                        transactionId: i.previousOutpoint.transactionId,
                        index: Number(i.previousOutpoint.index)
                    },
                    signatureScript: i.signatureScript,
                    sequence: Number(i.sequence),
                    sigOpCount: Number(i.sigOpCount || 1)
                };
                if (Number(tx.version || 0) === 1 && i.computeBudget !== undefined) {
                    inp.computeBudget = Number(i.computeBudget);
                }
                return inp;
            }),
            outputs: (tx.outputs || []).map((o) => {
                let spk = o.scriptPublicKey;
                if (typeof spk === "object") {
                    let v = spk.version !== undefined ? spk.version.toString(16).padStart(4, '0') : "0000";
                    spk = v + (spk.scriptPublicKey || spk.script);
                }
                let val = o.amount !== undefined ? o.amount : o.value;
                const out = {
                    scriptPublicKey: spk,
                    value: Number(val)
                };
                if (Number(tx.version || 0) === 1 && o.covenant !== undefined) {
                    out.covenant = o.covenant;
                }
                return out;
            }),
            lockTime: Number(tx.lockTime !== undefined ? tx.lockTime : (tx.lock_time || 0)),
            subnetworkId: tx.subnetworkId || tx.subnetwork_id || "0000000000000000000000000000000000000000",
            gas: Number(tx.gas || 0),
            payload: tx.payload || ""
        };
        if (normalizedTx.version === 1) {
            if (tx.storageMass !== undefined)
                normalizedTx.storageMass = Number(tx.storageMass);
            else if (tx.storage_mass !== undefined)
                normalizedTx.storageMass = Number(tx.storage_mass);
            else
                normalizedTx.storageMass = Number(tx.mass || 0); // fallback mapping if provided as mass
        }
        else {
            normalizedTx.mass = Number(tx.mass || 0);
        }
        return this.request("submitTransaction", { transaction: normalizedTx, allowOrphan });
    }
    async ping() {
        try {
            await this.getServerInfo();
            return true;
        }
        catch {
            return false;
        }
    }
    disconnect() {
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch { }
            this.ws = null;
        }
        for (const [, pending] of this.pending) {
            clearTimeout(pending.timer);
        }
        this.pending.clear();
    }
}
