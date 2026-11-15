---
title: AI Troubleshooting & Error Codes
description: Stable HardKAS error codes, root causes, and exact recovery commands for simnet, UTXOs, SilverScript, and artifacts.
sidebar_position: 3
---

# AI Troubleshooting & Error Codes

Always pass `--json` when diagnosing failures so HardKAS prints the stable `code` field.

| Error Code | Root Cause | Diagnostic Command | Safe Recovery |
| :--- | :--- | :--- | :--- |
| `RPC_CONNECTION_FAILED` / `RPC_INFO_UNAVAILABLE` | Node not running, wrong port (`18210` default for `toccata-v2`, or custom port in `hardkas.config.ts`), or missing `--rpclisten-json`. | `hardkas rpc health --network simnet --json` | Start localnet (`hardkas localnet start --profile toccata-v2`) or verify `docker ps` and `rpcUrl`. |
| `NODE_NOT_SYNCED` | Simnet node has no peers and stopped receiving mined blocks. | `hardkas rpc info --network simnet --json` | Start or resume the CPU miner until `Synced: yes`. |
| `NO_SPENDABLE_UTXOS` | Account has 0 UTXOs, or only immature coinbase rewards (< 1,000 DAA on simnet). | `hardkas accounts balance <name> --network simnet --json` | Fund the account or keep the miner running ~1,000 DAA (~1 minute) and retry. |
| `TX_SEND_WAIT_FAILED` | `tx send --wait` submitted the transaction (`outcome: submitted`), but confirmation did not finish within `--wait-timeout` (default 60 s). | `hardkas tx status <txId> --network simnet --json` | Do **not** resend blindly. Wait on the same txId: `hardkas tx wait <txId> --until confirmed --network simnet --url <ws://...> --json`. |
| `INSUFFICIENT_FUNDS_UPSTREAM` | Spendable UTXOs do not cover `amount + fee`. | `hardkas rpc utxos <address> --network simnet --json` | Reduce `--amount` or fund the account with more KAS. |
| `ARTIFACT_HASH_MISMATCH` | Artifact JSON was edited after creation (`contentHash` mismatch). | `hardkas artifact inspect <file> --json` | Do **not** edit hashes manually; re-run from the last intact step (`tx plan` / `tx sign`). |
| `REPLAY_MODE_UNSUPPORTED` | `replay verify` was called on a real-node (`simnet` / `testnet-10`) submission. | `hardkas tx status <txId> --network simnet --json` | Replay only covers `simulated` runs. Use `tx status` and `artifact verify --require consensus`. |
| `SILVER_VALUE_INVALID` | Passed a raw hex string for a SilverScript `bytes` constructor arg instead of a byte array. | `hardkas silver verify <compile.json> --args <args.json>` | Format as `[{"kind":"bytes","value":[...]}]` (for `pubkey`, use the 32-byte x-only key: compressed pubkey without byte 0). |
| `MAINNET_CONNECTION_DISABLED` / `MAINNET_SIGNING_DISABLED` / `MAINNET_BROADCAST_DISABLED` / `SILVERSCRIPT_MAINNET_NOT_ENABLED` | Mainnet is intentionally blocked in this release. | `hardkas doctor --json` | Switch `--network` to `simnet` (or `simulated` for local dry-runs). |
