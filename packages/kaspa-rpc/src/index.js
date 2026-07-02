import { WebSocket } from "ws";
export class JsonWrpcKaspaClient {
    socket = null;
    rpcUrl;
    timeoutMs;
    requestId = 1;
    constructor(options) {
        this.rpcUrl = options.rpcUrl;
        this.timeoutMs = options.timeoutMs ?? 10000;
    }
    rpcFlavor = null;
    preflightPromise = null;
    async detectFlavor() {
        if (this.rpcFlavor)
            return;
        if (this.preflightPromise)
            return this.preflightPromise;
        this.preflightPromise = (async () => {
            try {
                const ws = await this.connect();
                // Send getServerInfo first because wrpc accepts it, and legacy returns Method Not Found.
                // If we sent getServerInfoRequest first, wrpc would close the connection.
                const res = await this.requestRaw("getServerInfo", {});
                this.rpcFlavor = "wrpc";
            }
            catch (e) {
                const errMsg = e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e);
                if (errMsg.includes("Method not found")) {
                    this.rpcFlavor = "legacy";
                }
                else {
                    // If connection closed or timed out, default to wrpc and let it fail naturally later
                    this.rpcFlavor = "wrpc";
                }
            }
        })();
        return this.preflightPromise;
    }
    async callMethod(wrpcName, legacyName, params = {}) {
        await this.detectFlavor();
        const method = this.rpcFlavor === "legacy" ? legacyName : wrpcName;
        return this.requestRaw(method, params);
    }
    async getInfo() {
        const response = await this.callMethod("getInfo", "getInfoRequest");
        const info = mapKaspaNodeInfo(response);
        if (info.virtualDaaScore === undefined) {
            try {
                const dagResponse = await this.callMethod("getBlockDagInfo", "getBlockDagInfoRequest");
                const dagData = dagResponse?.params || dagResponse;
                if (dagData && typeof dagData === "object" && "virtualDaaScore" in dagData) {
                    info.virtualDaaScore = BigInt(dagData.virtualDaaScore);
                }
            }
            catch (e) { }
        }
        return info;
    }
    async healthCheck() {
        try {
            const info = await this.getInfo();
            return {
                endpoint: this.rpcUrl,
                status: "healthy",
                info,
                reachable: true
            };
        }
        catch (error) {
            return {
                endpoint: this.rpcUrl,
                status: "unreachable",
                lastError: error instanceof Error ? error.message : String(error),
                reachable: false
            };
        }
    }
    async getBalanceByAddress(address) {
        await this.detectFlavor();
        // For wrpc, we must use getBalancesByAddresses with { addresses: [address] }
        // For legacy, getBalanceByAddressRequest with { address } works
        let response;
        if (this.rpcFlavor === "legacy") {
            response = await this.callMethod("getBalanceByAddress", "getBalanceByAddressRequest", { address });
        }
        else {
            response = await this.callMethod("getBalancesByAddresses", "getBalancesByAddressesRequest", { addresses: [address] });
        }
        return mapKaspaAddressBalance(response, address);
    }
    async getUtxosByAddress(address) {
        const response = await this.callMethod("getUtxosByAddresses", "getUtxosByAddressesRequest", { addresses: [address] });
        if (!response || !response.entries) {
            return [];
        }
        return mapKaspaRpcUtxos(response, address);
    }
    async getUtxosByAddresses(addresses) {
        return await this.callMethod("getUtxosByAddresses", "getUtxosByAddressesRequest", { addresses });
    }
    async getBlocks(options = {}) {
        return await this.callMethod("getBlocks", "getBlocksRequest", options);
    }
    async submitTransaction(rawTransaction) {
        let txObj = rawTransaction;
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
            // Fix types for wRPC (it expects numbers for amounts/values)
            const txAny = txObj;
            if (txAny && typeof txAny === "object") {
                if (txAny.mass === undefined)
                    txAny.mass = 0;
                if (txAny.outputs && Array.isArray(txAny.outputs)) {
                    txAny.outputs.forEach((output) => {
                        if (output.amount !== undefined && output.value === undefined) {
                            output.value = output.amount;
                            delete output.amount;
                        }
                        if (typeof output.amount === "string")
                            output.amount = Number(output.amount);
                        if (typeof output.value === "string")
                            output.value = Number(output.value);
                        if (output.scriptPublicKey && typeof output.scriptPublicKey === "object") {
                            if (output.scriptPublicKey.scriptPublicKey !== undefined &&
                                output.scriptPublicKey.script === undefined) {
                                output.scriptPublicKey.script = output.scriptPublicKey.scriptPublicKey;
                                delete output.scriptPublicKey.scriptPublicKey;
                            }
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
        // Both flavors accept the transaction wrapped in an object
        const response = await this.callMethod("submitTransaction", "submitTransactionRequest", { transaction: txObj, allowOrphan: false });
        return mapKaspaSubmitTransactionResult(response);
    }
    async getMempoolEntry(txId) {
        try {
            const response = await this.callMethod("getMempoolEntry", "getMempoolEntryRequest", { transactionId: txId, includeOrphanPool: true, filterTransactionPool: false });
            if (!response)
                return null;
            const resObj = response;
            return {
                txId,
                acceptedAt: (resObj.acceptedAt || resObj.accepted_at)
            };
        }
        catch (e) {
            return null;
        }
    }
    async getTransaction(txId) {
        try {
            return await this.callMethod("getTransaction", "getTransactionRequest", {
                transactionId: txId
            });
        }
        catch (e) {
            return null;
        }
    }
    async getBlockDagInfo() {
        const info = await this.getInfo();
        const result = {
            networkId: info.networkId || "unknown",
            tipHashes: []
        };
        if (info.virtualDaaScore !== undefined) {
            result.virtualDaaScore = BigInt(info.virtualDaaScore);
        }
        return result;
    }
    async getServerInfo() {
        const info = await this.getInfo();
        const result = {
            networkId: info.networkId || "unknown"
        };
        if (info.serverVersion !== undefined)
            result.serverVersion = info.serverVersion;
        if (info.isSynced !== undefined)
            result.isSynced = info.isSynced;
        return result;
    }
    async close() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
    async requestRaw(method, params = {}) {
        const ws = await this.connect();
        const id = this.requestId++;
        const payload = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params
        });
        console.log(`[wRPC Debug] Sending payload: ${payload}`);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                console.log(`[wRPC Debug] Timeout for method: ${method}`);
                reject(new Error(`RPC request timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
            const onMessage = (data) => {
                try {
                    const raw = data.toString();
                    console.log(`[wRPC Debug] Received for ${method}: ${raw}`);
                    const response = JSON.parse(raw);
                    if (String(response.id) === String(id)) {
                        cleanup();
                        if (response.error) {
                            const err = response.error;
                            const msg = ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) || (typeof err === "string" ? err : JSON.stringify(err));
                            reject(new Error(msg));
                        }
                        else {
                            resolve(response.result !== undefined ? response.result : response.params);
                        }
                    }
                }
                catch (e) { }
            };
            const onError = (err) => {
                cleanup();
                reject(err);
            };
            const cleanup = () => {
                clearTimeout(timeout);
                ws.removeListener("message", onMessage);
                ws.removeListener("error", onError);
            };
            ws.on("message", onMessage);
            ws.on("error", onError);
            ws.send(payload);
        });
    }
    async connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return this.socket;
        }
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.rpcUrl);
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error(`Cannot connect to Kaspa RPC at ${this.rpcUrl}. Connection timed out.`));
            }, this.timeoutMs);
            ws.on("open", () => {
                clearTimeout(timeout);
                this.socket = ws;
                resolve(ws);
            });
            ws.on("error", (err) => {
                clearTimeout(timeout);
                let message = `Cannot connect to Kaspa RPC at ${this.rpcUrl}. Is kaspad running with --rpclisten-json?`;
                if ((err.code) === "ECONNREFUSED") {
                    message = `Connection refused at ${this.rpcUrl}. Ensure kaspad is running and --rpclisten-json is enabled.`;
                }
                reject(new Error(message));
            });
        });
    }
}
export function mapKaspaNodeInfo(result) {
    if (!result)
        return { raw: result };
    const info = {
        serverVersion: result.serverVersion || result.server_version,
        isSynced: result.isSynced !== undefined ? result.isSynced : result.is_synced,
        isUtxoIndexed: result.isUtxoIndexed !== undefined ? result.isUtxoIndexed : result.is_utxo_indexed,
        p2pId: result.p2pId || result.p2p_id,
        mempoolSize: result.mempoolSize !== undefined ? result.mempoolSize : result.mempool_size,
        networkId: result.networkId || result.network_id,
        raw: result
    };
    const score = result.virtualDaaScore !== undefined
        ? result.virtualDaaScore
        : result.virtual_daa_score !== undefined
            ? result.virtual_daa_score
            : result.params?.virtualDaaScore;
    if (score !== undefined) {
        info.virtualDaaScore = BigInt(score);
    }
    return info;
}
export function mapKaspaAddressBalance(result, address) {
    if (!result)
        return { address, balanceSompi: 0n, raw: result };
    let entry = result;
    if (Array.isArray(result)) {
        entry =
            result.find((e) => (e.address || e.addressString || e.address_string) === address) || result[0];
    }
    else if (result.entries && Array.isArray(result.entries)) {
        entry =
            result.entries.find((e) => (e.address || e.addressString || e.address_string) === address) || result.entries[0];
    }
    const balance = entry.balance !== undefined
        ? entry.balance
        : entry.balanceSompi !== undefined
            ? entry.balanceSompi
            : entry.amount;
    const balanceSompi = balance !== undefined ? BigInt(balance) : 0n;
    return {
        address,
        balanceSompi,
        raw: result
    };
}
export function mapKaspaRpcUtxos(result, address) {
    if (!result)
        return [];
    let entries = null;
    if (Array.isArray(result)) {
        entries = result;
    }
    else if (result.result && Array.isArray(result.result)) {
        entries = result.result;
    }
    else if (result.result && (result.result.entries || result.result.utxos)) {
        entries = result.result.entries || result.result.utxos;
    }
    else {
        entries = result.entries || result.utxos || result;
    }
    if (!Array.isArray(entries))
        return [];
    return entries.map((entryRaw) => {
        const entry = entryRaw;
        const utxoEntry = (entry.utxoEntry ||
            entry.utxo_entry ||
            entry.utxo ||
            entry);
        const outpoint = (entry.outpoint || entry);
        return {
            outpoint: {
                transactionId: String(outpoint.transactionId ||
                    outpoint.transaction_id ||
                    outpoint.txId ||
                    outpoint.tx_id ||
                    outpoint.transaction_hash ||
                    ""),
                index: Number(outpoint.index !== undefined
                    ? outpoint.index
                    : outpoint.outputIndex !== undefined
                        ? outpoint.outputIndex
                        : outpoint.output_index)
            },
            address: entry.address || address,
            amountSompi: BigInt(utxoEntry.amount || utxoEntry.amountSompi || utxoEntry.amount_sompi || 0),
            scriptPublicKey: String(utxoEntry.scriptPublicKey || utxoEntry.script_public_key || ""),
            blockDaaScore: utxoEntry.blockDaaScore || utxoEntry.block_daa_score,
            isCoinbase: Boolean(utxoEntry.isCoinbase || utxoEntry.is_coinbase),
            covenantId: utxoEntry.covenantId || utxoEntry.covenant_id,
            raw: entry
        };
    });
}
export function mapKaspaSubmitTransactionResult(result) {
    if (!result)
        return { raw: result };
    return {
        transactionId: result.transactionId || result.transaction_id || result.txId || result.tx_id,
        accepted: result.accepted !== undefined
            ? result.accepted
            : result.isAccepted !== undefined
                ? result.isAccepted
                : result.success !== undefined
                    ? result.success
                    : !!(result.transactionId ||
                        result.transaction_id ||
                        result.txId ||
                        result.tx_id),
        raw: result
    };
}
export class MockKaspaRpcClient {
    networkId;
    utxosByAddress = new Map();
    constructor(networkId = "simnet") {
        this.networkId = networkId;
    }
    async getInfo() {
        return {
            networkId: this.networkId,
            serverVersion: "mock",
            isSynced: true,
            virtualDaaScore: 0n,
            raw: {}
        };
    }
    async healthCheck() {
        return {
            endpoint: "mock://local",
            status: "healthy",
            info: await this.getInfo(),
            reachable: true
        };
    }
    async getBalanceByAddress(address) {
        const utxos = this.utxosByAddress.get(address) || [];
        const balanceSompi = utxos.reduce((acc, u) => acc + u.amountSompi, 0n);
        return { address, balanceSompi };
    }
    async getUtxosByAddress(address) {
        return this.utxosByAddress.get(address) || [];
    }
    async getUtxosByAddresses(addresses) {
        const allUtxos = addresses.flatMap(a => this.utxosByAddress.get(a) || []);
        return { entries: allUtxos };
    }
    async getBlocks(options) {
        return { blockHashes: [], blocks: [] };
    }
    setUtxos(address, utxos) {
        this.utxosByAddress.set(address, utxos);
    }
    async submitTransaction(rawTransaction) {
        return {
            transactionId: "mock-txid",
            accepted: true,
            raw: { rawTransaction }
        };
    }
    async getMempoolEntry(_txId) {
        return null;
    }
    async getTransaction(_txId) {
        return null;
    }
    async getBlockDagInfo() {
        return { networkId: this.networkId, virtualDaaScore: 0n };
    }
    async getServerInfo() {
        return { networkId: this.networkId, serverVersion: "mock", isSynced: true };
    }
    async close() { }
}
export * from "./json-rpc-client.js";
export * from "./health.js";
export * from "./errors.js";
export * from "./provider.js";
export * from "./resilience.js";
export * from "./wrpc-client.js";
