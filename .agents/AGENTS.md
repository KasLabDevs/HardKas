# HardKAS 0.11.3-alpha — Builder Labs Mode

## Context
HardKAS has reached 0.11.3-alpha.
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
