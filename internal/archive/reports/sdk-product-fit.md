# SDK Product Fit Analysis — HardKAS 0.7.11-alpha

Based on empirical data collected across **20 automated, non-adapted sandboxed runs** of HardKAS SDK, we evaluate its maturity as an application development library.

## 1. What is the SDK genuinely good for?

* **Node-centric Backend Notarization**: Simple document notarization, automated background wallets, and raw node planning/sending works cleanly via standard backend imports.
* **Traceable Lineage Scans**: Allows robust off-chain receipt audits directly in server environments.

## 2. Severe Gaps and Barriers Identified

* **Vite/React Client-Side Compilation Failure**: Spawning React/Vite builds fails immediately during compilation. The SDK imports Node-only builtins (like `fs`, `crypto`, `path`), which are incompatible with client-side bundlers.
* **Missing Core APIs**: The SDK lacks simple APIs like `listArtifacts()` and `queryLocalStore()`, forcing developers to write manual filesystem parsers (`fs.readdirSync`) or read SQLite databases directly.
* **Missing Signer Abstractions**: Lack of `signPartial` and `combineSignatures` in the SDK forces developers to shell out to `npx hardkas tx sign`.
