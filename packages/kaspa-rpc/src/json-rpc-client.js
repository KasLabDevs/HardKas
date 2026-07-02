import { RpcError, RpcTimeoutError, RpcUnavailableError, RpcCircuitOpenError, RpcRateLimitError, RpcValidationError } from "./errors.js";
import { calculateConfidence } from "./resilience.js";
import { coreEvents } from "@hardkas/core";
export var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
export class KaspaJsonRpcClient {
    url;
    timeoutMs;
    retry;
    circuitBreaker;
    fetcher;
    // State & Metrics
    circuitState = CircuitState.CLOSED;
    failureCount = 0;
    lastFailureTime = 0;
    lastError = null;
    lastLatencyMs = null;
    totalRequests = 0;
    successfulRequests = 0;
    lastDaaScore = null;
    lastDaaCheckTime = 0;
    retriesCount = 0;
    constructor(options) {
        this.url = options.url || "http://127.0.0.1:18210";
        this.timeoutMs = options.timeoutMs || 10000;
        this.retry = {
            maxRetries: options.retry?.maxRetries ?? 3,
            baseDelayMs: options.retry?.baseDelayMs ?? 500,
            maxDelayMs: options.retry?.maxDelayMs ?? 5000
        };
        this.circuitBreaker = {
            failureThreshold: options.circuitBreaker?.failureThreshold ?? 5,
            resetTimeoutMs: options.circuitBreaker?.resetTimeoutMs ?? 30000
        };
        this.fetcher = options.fetcher || globalThis.fetch;
    }
    async healthCheck() {
        this.checkCircuit();
        const start = Date.now();
        try {
            const info = await this.getInfo();
            const latency = Date.now() - start;
            // Stale Detection
            let stale = false;
            const now = Date.now();
            if (this.lastDaaScore !== null && info.virtualDaaScore !== undefined) {
                if (info.virtualDaaScore <= this.lastDaaScore &&
                    now - this.lastDaaCheckTime > 30000) {
                    stale = true;
                }
            }
            if (info.virtualDaaScore !== undefined) {
                this.lastDaaScore = info.virtualDaaScore;
                this.lastDaaCheckTime = now;
            }
            const resilience = calculateConfidence({
                latencyMs: latency,
                successRate: this.getSuccessRate(),
                retries: this.retriesCount,
                stale,
                reachable: true,
                circuitOpen: this.circuitState === CircuitState.OPEN
            });
            coreEvents.normalizeAndEmit({
                kind: "rpc.health",
                endpoint: this.url,
                state: resilience.state,
                score: resilience.score,
                latencyMs: latency,
                issues: resilience.issues
            });
            return {
                reachable: true,
                rpcUrl: this.url,
                status: resilience.state,
                info,
                latencyMs: latency,
                lastError: this.lastError,
                successRate: this.getSuccessRate(),
                circuitState: this.circuitState,
                score: resilience.score,
                confidence: resilience.confidence,
                retries: this.retriesCount,
                stale
            };
        }
        catch (e) {
            const resilience = calculateConfidence({
                latencyMs: null,
                successRate: this.getSuccessRate(),
                retries: this.retriesCount,
                stale: false,
                reachable: false,
                circuitOpen: this.circuitState === CircuitState.OPEN
            });
            coreEvents.normalizeAndEmit({
                kind: "rpc.health",
                endpoint: this.url,
                state: resilience.state,
                score: resilience.score,
                latencyMs: -1,
                issues: resilience.issues
            });
            return {
                reachable: false,
                rpcUrl: this.url,
                status: "unavailable",
                error: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e),
                lastError: this.lastError || (e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)),
                successRate: this.getSuccessRate(),
                circuitState: this.circuitState,
                confidence: resilience.confidence,
                score: resilience.score,
                retries: this.retriesCount
            };
        }
    }
    async getInfo() {
        const data = (await this.callRpc("getInfoRequest"));
        const info = {
            serverVersion: String(data.serverVersion),
            networkId: String(data.networkId),
            isSynced: Boolean(data.isSynced)
        };
        if (data.virtualDaaScore !== undefined)
            info.virtualDaaScore = BigInt(data.virtualDaaScore);
        if (data.mempoolSize !== undefined)
            info.mempoolSize = Number(data.mempoolSize);
        return info;
    }
    async getBlockDagInfo() {
        const data = (await this.callRpc("getBlockDagInfoRequest"));
        const dagInfo = {
            networkId: data.networkId,
            tipHashes: data.tipHashes,
            ...(data.virtualDaaScore !== undefined
                ? { virtualDaaScore: BigInt(data.virtualDaaScore) }
                : {})
        };
        return dagInfo;
    }
    async getUtxosByAddresses(addresses) {
        return await this.callRpc("getUtxosByAddressesRequest", { addresses });
    }
    async getBlocks(options) {
        return await this.callRpc("getBlocksRequest", options || {});
    }
    async getUtxosByAddress(address) {
        const data = (await this.callRpc("getUtxosByAddressesRequest", {
            addresses: [address]
        }));
        const entries = data.entries || [];
        return entries.map((e) => ({
            address: e.address,
            outpoint: {
                transactionId: e.outpoint.transactionId,
                index: e.outpoint.index
            },
            amountSompi: BigInt(e.utxoEntry.amount),
            scriptPublicKey: e.utxoEntry.scriptPublicKey,
            blockDaaScore: BigInt(e.utxoEntry.blockDaaScore),
            isCoinbase: e.utxoEntry.isCoinbase
        }));
    }
    async getBalanceByAddress(address) {
        const data = (await this.callRpc("getBalanceByAddressRequest", { address }));
        return {
            address: data.address,
            balanceSompi: BigInt(data.balance)
        };
    }
    async getMempoolEntry(txId) {
        try {
            const result = (await this.callRpc("getMempoolEntryRequest", {
                txId,
                includeOrphanPool: true
            }));
            return {
                txId,
                acceptedAt: String(result.entry.acceptedAt)
            };
        }
        catch (e) {
            return null;
        }
    }
    async getTransaction(txId) {
        try {
            const result = await this.callRpc("getTransactionRequest", { transactionId: txId });
            return result;
        }
        catch (e) {
            return null;
        }
    }
    async submitTransaction(rawTx) {
        let txObj = rawTx;
        try {
            while (typeof txObj === "string" && txObj.startsWith("{")) {
                const parsed = JSON.parse(txObj);
                if (parsed && typeof parsed === "object") {
                    if ("tx" in parsed)
                        txObj = parsed.tx;
                    else if ("inner" in parsed)
                        txObj = parsed.inner;
                    else
                        txObj = parsed;
                }
                else {
                    txObj = parsed;
                }
            }
            // One final check for POJO nested inner/tx in case it wasn't a string at a nested level
            while (txObj &&
                typeof txObj === "object" &&
                !Array.isArray(txObj) &&
                ("tx" in txObj || "inner" in txObj)) {
                if ("tx" in txObj)
                    txObj = txObj.tx;
                else if ("inner" in txObj)
                    txObj = txObj.inner;
            }
            const txAny = txObj;
            if (txAny && typeof txAny === "object") {
                txAny.mass = txAny.mass || 0;
                if (txAny.payload === undefined)
                    txAny.payload = "";
                if (txAny.outputs && Array.isArray(txAny.outputs)) {
                    txAny.outputs.forEach((output) => {
                        const amount = output.amount !== undefined ? output.amount : output.value;
                        output.value = typeof amount === "string" ? Number(amount) : amount;
                        delete output.amount;
                        if (output.scriptPublicKey && typeof output.scriptPublicKey === "object") {
                            const spk = output.scriptPublicKey;
                            const versionHex = (spk.version || 0).toString(16).padStart(4, "0");
                            const scriptHex = spk.script || spk.scriptPublicKey || "";
                            output.scriptPublicKey = versionHex + scriptHex;
                        }
                    });
                }
                if (txAny.inputs && Array.isArray(txAny.inputs)) {
                    txAny.inputs.forEach((input) => {
                        if (typeof input.sequence === "string")
                            input.sequence = Number(input.sequence);
                        if (typeof input.sigOpCount === "string")
                            input.sigOpCount = Number(input.sigOpCount);
                    });
                }
            }
        }
        catch (e) {
            // Ignored
        }
        const result = (await this.callRpc("submitTransactionRequest", {
            transaction: txObj,
            allowOrphan: false
        }));
        return { transactionId: result.transactionId };
    }
    async getServerInfo() {
        const info = await this.getInfo();
        const result = {
            networkId: info.networkId
        };
        if (info.serverVersion !== undefined)
            result.serverVersion = info.serverVersion;
        if (info.isSynced !== undefined)
            result.isSynced = info.isSynced;
        return result;
    }
    async close() {
        // No-op for HTTP
    }
    async callRpc(method, params = {}) {
        return this.withResilience(() => this.internalCall(method, params));
    }
    async withResilience(fn) {
        this.checkCircuit();
        if (this.circuitState === CircuitState.OPEN) {
            throw new RpcCircuitOpenError();
        }
        let lastErr;
        for (let attempt = 0; attempt <= this.retry.maxRetries; attempt++) {
            const start = Date.now();
            try {
                this.totalRequests++;
                const result = await fn();
                this.onSuccess(Date.now() - start);
                return result;
            }
            catch (e) {
                this.onFailure(e);
                lastErr = e;
                const isRetriable = e instanceof RpcError ? e.isRetriable : true;
                coreEvents.normalizeAndEmit({
                    kind: "rpc.error",
                    endpoint: this.url,
                    error: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e),
                    retriable: isRetriable
                });
                // Increment total retries count for health reporting
                if (attempt < this.retry.maxRetries && isRetriable) {
                    this.retriesCount++;
                }
                // Don't retry if it's a non-retriable error
                if (e instanceof RpcError && !e.isRetriable) {
                    throw e;
                }
                // Don't retry on deterministic protocol errors (e.g. invalid address, insufficient funds)
                if (this.isDeterministicError(e)) {
                    const err = e;
                    throw new RpcValidationError(((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)), (err.code), err.data);
                }
                if (attempt === this.retry.maxRetries)
                    break;
                const delay = Math.min(this.retry.baseDelayMs * Math.pow(2, attempt), this.retry.maxDelayMs);
                const jitter = Math.random() * 0.1 * delay;
                await new Promise((resolve) => setTimeout(resolve, delay + jitter));
            }
        }
        throw lastErr;
    }
    async internalCall(method, params) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetcher(this.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: Date.now(),
                    method,
                    params
                }),
                signal: controller.signal
            });
            clearTimeout(id);
            if (response.status === 429) {
                throw new RpcRateLimitError();
            }
            if (!response.ok) {
                throw new RpcUnavailableError(`HTTP Error ${response.status}`, response.status);
            }
            const body = await response.json();
            if (body.error) {
                throw new RpcError(body.error.message, body.error.code, body.error.data);
            }
            return body.result;
        }
        catch (e) {
            clearTimeout(id);
            if (e instanceof Error && (e.name) === "AbortError")
                throw new RpcTimeoutError();
            throw e;
        }
    }
    checkCircuit() {
        if (this.circuitState === CircuitState.OPEN) {
            const now = Date.now();
            if (now - this.lastFailureTime > this.circuitBreaker.resetTimeoutMs) {
                this.circuitState = CircuitState.HALF_OPEN;
            }
        }
    }
    onSuccess(latency) {
        this.lastLatencyMs = latency;
        this.successfulRequests++;
        this.failureCount = 0;
        this.circuitState = CircuitState.CLOSED;
    }
    onFailure(e) {
        this.lastError = ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e));
        // Only count as failure for circuit breaking if it's NOT a validation error
        if (e instanceof RpcValidationError || (e instanceof RpcError && !e.isRetriable)) {
            return;
        }
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.circuitBreaker.failureThreshold) {
            this.circuitState = CircuitState.OPEN;
        }
    }
    isDeterministicError(e) {
        const msg = (((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "").toLowerCase();
        const deterministicMarkers = [
            "invalid address",
            "insufficient funds",
            "schema validation",
            "artifact hash mismatch",
            "simulation error",
            "dust",
            "missing required",
            "outpoint already spent",
            "method not found"
        ];
        return deterministicMarkers.some((marker) => msg.includes(marker));
    }
    getSuccessRate() {
        if (this.totalRequests === 0)
            return 100;
        return (this.successfulRequests / this.totalRequests) * 100;
    }
}
