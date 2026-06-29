# DX Audit (0.11-alpha)

This audit captures the state of the Developer Experience (DX) for a builder arriving fresh to HardKAS 0.11-alpha.

## 1. `hardkas init` Audit
**Friction**: Previously, starting a new project required manual setup of complex `hardkas.config.ts` files, choosing between L2 vs L1 tooling, and manually defining evidence policies.
**Current State (0.11-alpha)**: `hardkas init` reliably scaffolds a modern TypeScript workspace. It automatically provisions the default `WalletToolkit` examples and establishes the `<project>/.hardkas` directory. 
- **Verdict**: Smooth. The only friction is that developers might mistakenly use `npm install` instead of `pnpm install` in some environments, but this is explicitly documented.

## 2. Templates Audit
**Friction**: Historically, templates relied on `number` for financial sums which led to precision loss or confusing runtime errors when bridging natively to Kaspa.
**Current State**: All templates generated via `hardkas init` (or `pnpm templates:verify`) have been upgraded during P53.1 to strictly use `bigint` for amounts, balances, and fees.
- **Verdict**: Secure and precise. Zero float coercion occurs by default.

## 3. API Examples Audit
**Friction**: Prior examples used deprecated direct RPC injections and manually instantiated storage backends.
**Current State**: Examples now use the asynchronous factory patterns standard to 0.11:
```ts
const wallet = await WalletToolkit.open('my-wallet');
const indexer = await IndexerToolkit.open({ backend: kaspaRpcBackendPlugin({ url }) });
```
- **Verdict**: Consistent. The separation of `Toolkit` from the `Plugin` backend is cleanly delineated.

## 4. Known Limitations Assessment
The following elements remain explicitly unsupported or limited in 0.11-alpha:
- **Silver Toolkit**: Completely simulation-only. Compilation and verification run in isolation but cannot be bridged to real networks yet.
- **L2 Production Tooling**: HardKAS acts as a local-first validation environment. Full mainnet deployment architectures for L2 sequences do not exist.
- **Mainnet Broadcast Guarantees**: While transactions build correctly and deterministically, there are zero guarantees on mainnet propagation behaviors under heavy load. Use SIMNET for development.
- **RPC Backend Plugin V1**: Currently lacks advanced connection pooling and retry jitter.
- **Snapshot Limitations**: When using external state backends (like Rusty Kaspad), snapshots capture *stubs/metadata* rather than the full remote DAG state.
- **Docker Simnet**: Windows users must ensure WSL2 networking bridging allows `127.0.0.1:18210` to forward correctly into the Rusty Kaspa container, otherwise WebSocket connections silently fail.
