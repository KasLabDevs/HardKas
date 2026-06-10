# What HardKAS is NOT

It is critical to understand the boundaries of this system. HardKAS is a local-first development OS, but to prevent misunderstandings, we explicitly define what we do not do.

### ❌ HardKAS is NOT:

- **A Wallet**: We do not manage seed phrases for users or hold real assets on mainnet safely. Our keystore is strictly for local automated simulations and test environments.
- **A Consensus Layer**: We do not reach distributed consensus. HardKAS works offline by trusting the deterministic hash of artifacts on your local disk.
- **A Replacement for Kaspa Nodes**: HardKAS relies on Kaspa RPC nodes for network synchronization and state diffs. We do not index the global DAG.
- **A Smart Contract VM**: HardKAS orchestrates workflows and enforces determinism of external computations (like Igra L2 logic), but does not run a Turing-complete state machine internally.
- **A Custody System**: We do not provide enterprise-grade secure enclaves or HSM integrations for securing mainnet capital.

### ✓ HardKAS IS:

- **Deterministic transaction workflow layer**: HardKAS ensures that identical inputs across Windows, Mac, or Linux yield byte-identical transactions and cryptographic hashes.
- **Artifact integrity system**: A zero-trust local verification lattice that guarantees JSON artifacts cannot be manipulated, replayed out of order, or poisoned.
- **SDK/CLI developer framework**: A high-level programmatic interface for building verifiable L2 agents and pipelines.
- **Local-first verification environment**: An offline, simulated network that enables you to test 100% of your business logic before hitting a real testnet.
