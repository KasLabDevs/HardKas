import { RpcUnavailableError } from "./errors.js";
export class LoadBalancedRpcProvider {
    clients;
    options;
    currentIndex = 0;
    constructor(clients, options = { strategy: "failover" }) {
        this.clients = clients;
        this.options = options;
        if (clients.length === 0) {
            throw new Error("LoadBalancedRpcProvider requires at least one client");
        }
    }
    async getInfo() {
        return this.withFailover((c) => c.getInfo());
    }
    async healthCheck() {
        const healths = await Promise.all(this.clients.map((c) => c.healthCheck()));
        const primaryHealth = healths[this.currentIndex];
        const allHealthy = healths.every((h) => h.status === "healthy");
        const anyHealthy = healths.some((h) => h.status === "healthy" || h.status === "degraded");
        return {
            endpoint: `LoadBalancedProvider(${this.clients.length} nodes)`,
            status: allHealthy ? "healthy" : anyHealthy ? "degraded" : "unreachable",
            latencyMs: primaryHealth.latencyMs,
            lastError: primaryHealth.lastError,
            retries: healths.reduce((sum, h) => sum + (h.retries || 0), 0),
            circuitState: primaryHealth.circuitState,
            stale: healths.some((h) => h.stale),
            info: primaryHealth.info,
            reachable: anyHealthy
        };
    }
    async getBalanceByAddress(address) {
        return this.withFailover((c) => c.getBalanceByAddress(address));
    }
    async getUtxosByAddress(address) {
        return this.withFailover((c) => c.getUtxosByAddress(address));
    }
    async getUtxosByAddresses(addresses) {
        return this.withFailover((c) => c.getUtxosByAddresses(addresses));
    }
    async getBlocks(options) {
        return this.withFailover((c) => c.getBlocks(options));
    }
    async submitTransaction(rawTransaction) {
        return this.withFailover((c) => c.submitTransaction(rawTransaction));
    }
    async getMempoolEntry(txId) {
        return this.withFailover((c) => c.getMempoolEntry(txId));
    }
    async getTransaction(txId) {
        return this.withFailover((c) => c.getTransaction(txId));
    }
    async getBlockDagInfo() {
        return this.withFailover((c) => c.getBlockDagInfo());
    }
    async getServerInfo() {
        return this.withFailover((c) => c.getServerInfo());
    }
    async close() {
        await Promise.all(this.clients.map((c) => c.close()));
    }
    async withFailover(fn) {
        let lastError;
        // Try all clients starting from the current index
        for (let i = 0; i < this.clients.length; i++) {
            const index = (this.currentIndex + i) % this.clients.length;
            const client = this.clients[index];
            try {
                const result = await fn(client);
                // If successful and strategy is round-robin, move to next for next call
                if (this.options.strategy === "round-robin") {
                    this.currentIndex = (index + 1) % this.clients.length;
                }
                else {
                    // If failover, keep using this index as it's healthy
                    this.currentIndex = index;
                }
                return result;
            }
            catch (error) {
                lastError = error;
                // Continue to next client if this one is unavailable/timeout
            }
        }
        throw lastError || new RpcUnavailableError("All RPC endpoints failed");
    }
}
