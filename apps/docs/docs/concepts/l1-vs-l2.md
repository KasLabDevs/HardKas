---
title: Kaspa L1 vs Igra L2
---

System

Role

HardKAS treatment

Kaspa L1

Proof-of-work blockDAG, sequencing, data availability, state anchoring and finality via GHOSTDAG / future DAGKnight model.

HardKAS queries RPC, manages local wallets and simulates workflows. It does not validate consensus.

Kasplex L1

Asset hub for native asset issuance and transfer on Kaspa L1.

Distinguished from Kasplex L2 architecture terminology.

Igra L2

EVM-compatible L2 execution environment in the based-rollup architectural class.

The HardKAS L1 CLI and `@hardkas/sdk` do not send L2 transactions. The separate, experimental `@hardkas/l2` package (and the `hardkas l2` command group of the `l2` extension, `@hardkas/ext-l2`) provides profiles, RPC health, balance/nonce queries and transaction build/sign/send, with chain binding, explicit mainnet authorization and fee ceilings. The default profile is `local` (Anvil); `igra-mainnet` is never selected implicitly. Receipts are what the RPC reports: HardKAS does not verify settlement on Kaspa L1. `@hardkas/l2` and `@hardkas/ext-l2` are not published in this release, so `hardkas extension install l2` cannot fetch the extension from npm (see `docs/status/versioning.md` in the repository).

Bridge phases

Pre-ZK → MPC/committee-style assumptions → ZK exit phase.

HardKAS performs no bridge operations; it reports static bridge assumptions (pre-ZK, `trustlessExit: false`). Pre-ZK and MPC phases do not provide trustless exit, and a ZK proof system alone does not either until a proof-based withdrawal path is deployed and live.

**No EVM on Kaspa L1.** HardKAS documentation and examples must preserve this boundary. Execution happens on L2, not on Kaspa L1.
