# P56: RPC Resilience Ready

The `@hardkas/plugin-rpc-backend` has been successfully upgraded to support production-grade connection resilience, closing the first milestone of the 0.12 roadmap.

## Implementation Details

The RPC Plugin now implements a strict resilience wrapper without modifying the underlying SDK or base RPC clients (`kaspa-rpc`). The wrapper introduces:

- **Exponential Backoff & Jitter**: Automatically spaces out connection and request retries.
- **Request Timeouts**: Prevents stalling on hanging sockets via `Promise.race`.
- **Automatic Reconnection**: Re-establishes dropped WebSockets transparently before retrying operations.
- **Structured Errors**: Disambiguates between `HardkasRpcConnectionError`, `HardkasRpcTimeoutError`, and `HardkasRpcSemanticError` (e.g., "UTXO index not enabled", which correctly bypasses infinite retries).
- **Graceful Shutdown**: The `disconnect()` command now halts any pending reconnect attempts.

## Metrics & Observability

The plugin instance now exposes `.stats()` tracking network friction:

```typescript
{
    retries: number;
    reconnects: number;
    timeouts: number;
    failures: number;
}
```

## Configuration

The consumer can now explicitly dictate resilience bounds in the plugin options:

```typescript
kaspaRpcBackendPlugin({
    url: "ws://127.0.0.1:18210",
    resilience: {
        maxRetries: 5,
        baseDelayMs: 250,
        maxDelayMs: 5000,
        timeoutMs: 15000,
        jitter: true
    }
});
```

This ensures HardKAS applications using the V1 RPC Backend can survive real-world node instability.
