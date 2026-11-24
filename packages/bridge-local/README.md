# `@hardkas/bridge-local`

Documentation: [hardkas.dev/docs](https://hardkas.dev/docs/) · Website: [hardkas.dev](https://hardkas.dev)

Offline helpers for an Igra L2 bridge lab: a bridge entry payload, a prefix-mining simulation over it, and a local plan that carries it. It is **not** a bridge: nothing here moves funds to L2, talks to an L2, or enforces a bridge policy.

> It belongs to the Igra L2 Lab, not to the HardKAS L1 core: the L1 CLI registers no `bridge` command group. What follows is this package's API, not `hardkas` commands.

## Exports

- **`serializeBridgePayload` / `deserializeBridgePayload`**: a fixed-layout hex encoding of a `BridgeEntryPayload` (`marker`, e.g. `IGRA`; a 20-byte EVM address; the amount in sompi; a 2-byte network tag; a nonce). A simplified model for the lab, not a protocol format.
- **`simulatePrefixMining(payloadBase, prefix, options?)`**: increments the payload's nonce until a domain digest of the serialized payload starts with `prefix` (default at most 100,000 attempts or 5 s). It hashes the payload, not a transaction id, and runs in memory only.
- **`planBridgeEntry(request)`**: plans, with the kaspa-wasm Generator, a payment from the caller's UTXOs (`availableUtxos`) back to `fromAddress`, with the serialized payload as the transaction payload and change to `fromAddress`. Identities are planned as the simulator's. It persists nothing and signs nothing.
- **`resolveBridgeLocalContext(options)`**: picks the L1 wallet and the L2 address from explicit values, a named session or the active session (the session store of `@hardkas/core`); only sessions in `local-simulated` mode are accepted.
