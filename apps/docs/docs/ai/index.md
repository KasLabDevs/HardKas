---
title: Build on Kaspa with AI
description: Canonical AI-agent guide for HardKAS — capabilities, CLI vs SDK routing, environment boundaries, and verified Kaspa L1 workflows.
sidebar_position: 1
---

# Build on Kaspa with AI

HardKAS is a local-first development framework, transaction planner/signer, SilverScript toolchain wrapper, and artifact verifier for **Kaspa L1**.

> [!IMPORTANT]
> **Kaspa L1 is a Proof-of-Work UTXO BlockDAG, NOT an EVM.**
> - Do not write Solidity or EVM RPC scripts for Kaspa L1.
> - Do not write custom `kaspa-wasm` payment/signing scripts when a HardKAS CLI command or SDK method already implements the operation.
> - Do not treat `simulated` ledger runs or local `silver test` (`SCRIPT_VM`) runs as real node consensus proof.

## Versions & Pinned Toolchain

- **Repository development version:** `0.13.0-rc.3`
- **Published on npm (`latest` / `next`):** `0.13.0-rc.2` (use `npx @hardkas/cli@0.13.0-rc.2` or `npx @hardkas/cli@latest` when installing from npm outside the monorepo)
- **Localnet node (`--profile toccata-v2`):** `rusty-kaspad` `v2.1.0` (container `hardkas-kaspad-toccata-v2`, JSON wRPC port `18210`; custom Docker setups may publish another port such as `26510`)
- **SilverScript compiler:** `silverc` `v1.0.0` (installed via `hardkas toolchain install silverc`)
- **Node.js requirement:** `24.22.1`

## What HardKAS Does (and Does Not Do)

| Area | Status in this release | Notes for agents |
| :--- | :--- | :--- |
| Payments (`tx plan`, `tx sign`, `tx send`, `tx wait`, `tx status`) | Verified on `simnet` | Uses upstream `kaspa-wasm` Generator; supports Schnorr & ECDSA, CLTV (`--lock-time-daa` / `--lock-time-ms`), and multi-recipient batches. |
| SilverScript P2SH (`silver compile`, `verify`, `deploy`, `spend`) | Verified on `simnet` | Compiles `.sil` with pinned `silverc v1.0.0`, deploys and spends v0 P2SH contracts. |
| Toccata 1:1 Covenants (`silver covenant genesis`, `transition`, `inspect`) | Verified on `simnet` | Real v1 transactions on `rusty-kaspad v2.1.0` with `covenant_id` lineage checks. |
| Artifact & Receipt Verification (`artifact inspect`, `artifact verify`, `tx receipt`) | Verified | Integrity check works offline on all networks; network & consensus checks query a real node of the artifact's network. |
| `silver covenant start\|advance` (1:N, N:M), `kcc20`, `silver test --on-node`, `zk toccata spend`, `testnet-10` | **Experimental** | Explicitly opt-in or experimental; do not present as production-ready. |
| `silver test`, `silver debug`, `silver preflight` (local runner) | **Unverified (`SCRIPT_VM`)** | Requires `--allow-unverified-runner` with a local build; **never** independent consensus proof. Use `--on-node` or real node spends for consensus checks. |
| `mainnet` (reads, signing, broadcast) | **Blocked by policy** | Refused before any network connection (`MAINNET_CONNECTION_DISABLED`, `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`). |
| `vProgs`, trustless bridges, `@hardkas/l2`, `@hardkas/pskt-native` | **Not supported / Not published** | Only offline artifact inspection for vProgs; do not invent bridge or L2 commands. |

## Environment Matrix

| Environment | `network` flag | Node required | Consensus proof? | Typical use |
| :--- | :--- | :--- | :--- | :--- |
| In-memory ledger | `simulated` | No | **No** (synthetic UTXOs, no script VM) | Fast local loop, `replay verify` |
| Managed or custom simnet | `simnet` | Yes (`rusty-kaspad 2.1.0`) | **Yes** (local node consensus) | Payments, SilverScript P2SH, Toccata v1 covenants |
| Public Testnet-10 | `testnet-10` | Yes (opt-in) | Yes (experimental) | Public test funds only (`experimental: true`, `allowPublic: true`) |
| Mainnet | `mainnet` | Refused | Offline `artifact verify` only | Blocked for RPC, signing, and broadcast |

## First Checks Before Running Tasks

Run these machine-readable checks first so you never assume unavailable features:

```bash
hardkas doctor --json
hardkas silver doctor --network simnet --json
```

In TypeScript SDK code, call `sdk.capabilities.get()` before invoking optional or experimental namespaces.

## Canonical Entry Points

- **Step-by-step agent recipes (6 core tasks):** [Canonical Workflows](./workflows.md)
- **Error codes & recovery:** [AI Troubleshooting](./troubleshooting.md)
- **Agent setup for Claude Code & Cursor:** [Claude Code & Cursor Guide](./claude-code-and-cursor.md)
- **Machine-readable maps:** [`/llms.txt`](https://hardkas.dev/llms.txt) (short navigation map) and [`/llms-full.txt`](https://hardkas.dev/llms-full.txt) (complete AI reference)
- **Full human guide for simnet:** `docs/start/build-on-simnet.md` in the repository
- **Video tutorials:** [KasLabDevs on YouTube](https://www.youtube.com/@kaslabdevs)
