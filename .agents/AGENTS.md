# HardKAS 0.12.0-rc.19 — Builder Labs Mode

## Context
HardKAS has reached 0.12.0-rc.19.
The framework is considered feature-complete enough to begin validating itself through real Kaspa applications.
From this point forward, the primary objective is not adding features, but discovering missing SDK capabilities by building production-like applications.
Every new SDK helper, plugin, template or CLI feature must originate from an actual application requirement.

## Philosophy
Never ask:
"What helper should we build?"

Instead ask:
"What application are we trying to build?"

**Applications define the SDK. The SDK never defines applications.**

## Development Rule
Always follow this chain:
`Application` -> `Real developer friction` -> `Missing capability` -> `SDK helper / Plugin / Template` -> `Tests` -> `Documentation` -> `Evidence`

Never implement speculative APIs.

## HardKAS Identity
HardKAS is not an EVM framework.
HardKAS is a local-first Kaspa builder framework.

Its differentiators are:
- deterministic execution
- reproducible artifacts
- evidence packages
- policy engine
- scenario runner
- plugin architecture
- task system
- local-first development

Do not copy Hardhat.
Design around Kaspa's architecture.

## Scope
The framework should eventually support building every major category of Kaspa software.

### Priority 1
- Wallet backends
- Merchant checkout systems
- Payment processors
- Local indexers
- Backend services
- Plugin ecosystem
- Real examples

### Priority 2
- UTXO tooling
- Coin control
- Fee estimation
- DAG tooling
- Snapshot manager
- Time travel
- Conflict laboratories

### Priority 3
- Multi-node orchestration
- Network partitions
- Latency simulation
- Reorg simulation
- Infrastructure testing
- L2 experimentation

## Rules
Every application must answer:
- What SDK helpers were missing?
- What plugins were missing?
- What templates were missing?
- What CLI commands were missing?
- What artifacts should exist?
- What evidence should be generated?

Those become roadmap items.

### Execution Worlds Rule (CRITICAL)
Never infer execution mode from an account name or network string.
Resolve the ExecutionTarget first.
Then validate account/artifact/receipt compatibility.

## Evidence First
Every meaningful operation should ideally produce evidence.
Applications should naturally integrate with:
`Scenario` -> `Artifacts` -> `Scenario Result` -> `Evidence Package` -> `Verify`

## Design Principles
**Prefer:**
- Small reusable SDK helpers
- Typed APIs
- Deterministic outputs
- Simple plugins
- Local-first execution
- Strict policy enforcement

**Avoid:**
- Magic globals
- Implicit state
- Reflection
- Runtime monkey-patching
- Network-dependent development
- Hidden side effects

## Roadmap Validation
The roadmap is no longer theoretical.
Every roadmap item must be justified by a real Builder Lab.
No feature exists without a consuming application.

## Builder Labs
The canonical validation projects are:
- Wallet Backend
- Merchant Checkout
- Local Indexer
- Payment Service
- Explorer
- Wallet CLI
- Custody Service
- Oracle Service
- Batch Engine
- Full Stack Demo

These applications define the future of the SDK.

## Success Metric
HardKAS succeeds when developers can build real Kaspa applications with minimal friction.
The framework should evolve from real-world usage rather than hypothetical requirements.

## Stabilized Architectural Decisions (Phases 3-5)
The following decisions are stabilized and must be respected in all future work to prevent architectural regression:

### 1. Dependency Graph Levels
- **Level 0 (Foundations)**: `core`, `config`, `observability` (logging/metrics).
- **Level 1 (Core Primitives / Execution)**: `artifacts`, `accounts`, `tx-builder`, `kaspa-rpc`, `simulator`, `localnet`. These must NEVER depend on higher levels.
- **Level 2 (Composition / Product API)**: `sdk`. The SDK is a composition layer that orchestrates primitives and may optionally expose/bundle extensions for convenience.
- **Level 3 (Extensions)**: `query`, `query-store`, `jobs`, `wallet-adapter`, `node-runner`, `l2`, etc.
- **Level 4 (Presentation)**: `cli`, `react`, `client`, and builder labs.

### 2. State Ownership & UTXOs
- **State Truth**: HardKAS relies on (1) Artifacts (Durable/History), (2) RPC/Node (Authoritative Live), (3) Localnet/Simulator (Execution Context), and (4) Projections (Read-only indexes like `query-store`).
- **query-store**: Validated as a `CORE-ADJACENT / READ MODEL`. It projects state but does not own it.
- **UTXO Spendability**: RPC UTXO visibility (`getUtxosByAddresses`) is DAG-based and ignores mempool-spent inputs. `UtxoProvider` adapters for RPC must explicitly handle mempool semantics to prevent double-spend errors during planning.

### 3. Public Surface
- **Experimental Facades**: `zk`, `l2`, `vprogs`, `covenants`, and `dev-server` are NOT part of the default public CLI/SDK surface. They must be explicitly imported or used as separate tools.
- **Workflow**: Promoted to Core-Adjacent. It operates exclusively on the central transactional pipeline without experimental contamination.

## AI Directives
See the following root documents for strict autonomous agent guidelines:
- `AI_ARCHITECTURE_RULES.md`
- `AI_CHANGE_POLICY.md`
