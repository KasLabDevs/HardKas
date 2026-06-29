# HardKAS Gap Matrix (P27)

Matriz de capacidades, necesidades y prioridades para alcanzar la visión de "Hardhat para TODO Kaspa".

| Area | App Example | Needs | HardKAS Has | Missing | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Wallet** | `wallet-backend` | accounts, balance, send, history | partial | history/indexer, coin control | P1 |
| **Payments** | `merchant-checkout`| invoice, detect (0-conf), confirm | tx/evidence | invoice helper, 0-conf tracker | P1 |
| **Indexer** | `local-explorer` | sync, projection, query, events | query-store | block model, webhook events | P1 |
| **DAG** | `conflict-lab` | DAG scenarios, double spends | partial simulator | better visual model, custom topology | P2 |
| **UTXO** | `coin-consolidator`| merge/split, custom sighash | RPC bindings | UTXO visualizer, bulk helpers | P2 |
| **Services** | `oracle-backend` | CI/CD fixtures, test mocking | vitest integration | network time-travel, snapshots | P2 |
| **Localnet** | `stress-test` | multi-node, latency, reorgs | single mock node | multi-node docker orchestration | P3 |
| **L2** | `readiness-lab` | config, bridge assumptions, SPV | experimental | SPV verifiers, rollup hooks | P3 |
| **Plugins** | `custom-linter` | HRE hooks, test utilities | modular HRE | plugin devkit/test utils, docs | P1 |
| **Examples** | `fullstack-dapp` | E2E demo, `npx init` | basic scripts | realistic app templates (Next.js) | P1 |
