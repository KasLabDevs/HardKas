# HardKAS 0.4.0-alpha: What Actually Works

Last verified: 2026-05-15

This document classifies every system by actual implementation status.
Every item is verifiable in source code. No aspirational claims.

## STABLE

Systems that are implemented, tested, and relied upon.

### Core Infrastructure
- **Atomic persistence**: All canonical writes use writeFileAtomic (temp+rename+fsync). Zero direct writes to canonical state.
- **Workspace locks**: O_EXCL atomic acquisition, PID liveness checks, stale detection (throws, doesn't auto-break), deterministic ordering. CLI: `hardkas lock list`, `hardkas lock status`, `hardkas lock clear`.
- **Corruption detection**: 27 machine-readable CorruptionCode values with severity, path, and line numbers.
- **Secret redaction**: `maskSecrets()` applied in all CLI error paths including stack traces.
- **Mainnet guards**: Hard refusal for signing/faucet/fund without explicit `--allow-mainnet-signing`.
- **Keystore encryption**: Argon2id + AES-GCM with 0600 file permissions.
- **.gitignore protection**: `hardkas init` auto-creates/updates .gitignore with `.hardkas/`.

### Artifact Engine
- **Canonical hashing v3**: Recursive key sorting, BigInt→string, undefined stripping, NFC Unicode normalization, \r\n→\n newline normalization. CURRENT_HASH_VERSION=3.
- **13 SEMANTIC_EXCLUSIONS**: contentHash, artifactId, planId, lineage, createdAt, rpcUrl, indexedAt, file_path, file_mtime_ms, hardkasVersion, version, parentArtifactId, signedId.
- **Lineage verification**: Structural integrity, identity consistency, chain continuity, sequence monotonicity, state transition validation, cross-network contamination detection.
- **Reproducibility proof**: Golden hashes committed. CI matrix: ubuntu × macos × node 20/22.

### L1 Transaction Lifecycle
- **Plan → Sign → Send → Receipt → Trace**: Full pipeline with deterministic artifact IDs derived from content hashes.
- **L1/L2 separation**: Bridge module enforces trustlessExit=false for pre-ZK phase. No EVM on L1.

### Developer Tools
- **`hardkas capabilities --json`**: Machine-readable self-description with trust boundaries.
- **`hardkas doctor --json`**: Structured diagnostics (runtime, persistence, security, docker, network).
- **`hardkas new <name>`**: Project scaffolding with config, scripts, tests, and README.
- **`hardkas console`**: Interactive REPL with harness, hash helpers, and persistent history.
- **`hardkas run script.ts`**: Script runner with harness injection via tsx.
- **`hardkas test --mass-report`**: Transaction mass/fee reporting integrated in test runner.
- **`hardkas networks`**: Network registry with hierarchical resolution (CLI > config > built-in).
- **Deployments**: `hardkas deploy track`, `hardkas deploy list`, `hardkas deploy inspect`, `hardkas deploy status`, `hardkas deploy history`. Local deployment tracking with content-addressed records.

### Query & Storage
- **SQLite query store**: Auto-discovery, migrations with checksums, transactional, rebuildable read model.
- **Schema migrations**: Forward-only, versioned, checksummed, with legacy bootstrap.

## EXPERIMENTAL

Systems that work but are research-grade or have known limitations.

- **`hardkas localnet fork`**: Fork real network UTXO state to local simulation via RPC.
- **GHOSTDAG simulator**: ApproxGhostdagEngine with ordering, coloring, reachability, mergeset, K-constraint. Marked RESEARCH_EXPERIMENTAL throughout. NOT rusty-kaspa validated.
- **DAG simulation scenarios**: Linear, wide, fork, diamond. Deterministic with metrics.
- **Mass profiler**: profileMass, compareMassProfiles, saveMassSnapshot. Regression detection.
- **Replay verification**: Local workflow reproducibility only. `consensusValidation: "unimplemented"`. NOT proof of Kaspa consensus correctness.
- **Testing framework**: createTestHarness, createFixture, 11 custom vitest matchers.

## PARTIAL

Systems that exist but have gaps or external dependencies.

- **L2/Igra transaction lifecycle**: Build, sign, send. Depends on Igra RPC availability.
- **Docker node orchestration**: start, stop, reset, logs, status. Depends on Docker being installed.
- **L2 bridge assumptions**: Profile registry with phase awareness. No remote chainId validation.
- **Shared SSE & Cockpit Dashboard**: Centralized EventSource stream with exponential backoff cap at 10s. SSE supports reconnect/backoff, but does not yet provide durable replay cursors or monotonic event IDs. Visual cockpit dashboard is hooked to Hono health endpoints with SSE-based invalidation.

## NOT IMPLEMENTED

- Consensus validation (not planned — HardKAS is developer tooling)
- Production wallet (explicitly out of scope)
- SilverScript / covenants (post-Toccata)
- Trustless exit (requires ZK bridge phase)
- Differential DAG validation against rusty-kaspa
- Plugin system
- Multi-node Docker orchestration

## Trust Boundaries

- **Replay**: local workflow reproducibility only, not consensus proof
- **Artifacts**: internal integrity/identity only, not on-chain finality proof
- **Simulator**: research-grade approximation, not protocol equivalence
- **Query store**: rebuildable read model, not canonical truth
- **L2 bridge**: pre-ZK trust assumptions, not trustless
- **Deployments**: local tracking records, not on-chain confirmation proof
