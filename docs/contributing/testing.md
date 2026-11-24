---
title: Testing HardKAS itself
description: How the HardKAS repository's own test suites are split by the infrastructure they need, how to run each one, and where a new test belongs.
---

# Testing HardKAS itself

This page is for contributors to the HardKAS repository. To write tests for your own project, start with
[Your first HardKAS test](../guides/your-first-test.md).

HardKAS is evidence-oriented, so how a feature is proven matters as much as the feature. The suites are split by the
infrastructure they need, and a suite never changes its evidence level quietly: a test that needs a node fails when the
node is missing; it does not skip or fall back to a mock. The vocabulary (L0 to L5, implemented against qualified) is
in [Evidence levels](./evidence-levels.md).

> **Documentation communicates qualification; it does not manufacture it.** A capability is L3 only when an automated
> run against a real Kaspa node proves it. One manual run by a developer is not lasting evidence.

## Running the suites

All suites use Vitest and run from the repository root.

| Suite | Command | Needs | Files |
| :-- | :-- | :-- | :-- |
| Default (L0 to L2) | `pnpm test` | nothing: unit, component and simulator tests, plus the workflow corpus | `*.test.ts`, without the level suffixes below |
| Hermetic gate | `pnpm test:hermetic` | nothing; runs the default suite as the release gate does (`scripts/gate-hermetic.mjs`) | as above |
| Localnet (L3) | `pnpm test:localnet` | Docker; its global setup starts the node, workspace and dev server (`vitest.localnet.config.ts`) | `*.localnet.test.ts` |
| Simnet (L3) | `pnpm test:simnet` | Docker; a real rusty-kaspad on simnet (`vitest.simnet.config.ts`, `packages/testing/src/simnet-node-harness.ts`) | `*.simnet.test.ts` |
| End to end | `pnpm test:e2e:docker` | Docker; full CLI flows, one file at a time | `*.e2e.test.ts` |
| Fuzz and property | `pnpm test:fuzz` | nothing | the fuzz files of `packages/testing/test` |

A suite that needs Docker fails, rather than skips, when Docker is not available.

## Regression tests named after hardening waves

Files such as `packages/sdk/test/wave1-def1c-canonical-identity.test.ts` or
`packages/cli/test/wave7-replay-mode-guard.test.ts` are not leftovers. Each encodes an invariant found during a
hardening wave (canonical artifact identity and namespaces; fund and recipient semantics; the replay guard that fails
closed on real-node submissions). Do not rename or delete them.

## Where a new test goes

1. It talks to a Kaspa node over RPC, or depends on real consensus rules: name it `*.localnet.test.ts` or
   `*.simnet.test.ts`. That is L3 evidence.
2. It runs a CLI command from outside the process: name it `*.e2e.test.ts`.
3. It checks the planner, a policy or a guard, or mocks the network: name it `*.test.ts`. It belongs to the default
   suite (simulator or component evidence).

A test that mocks the Kaspa RPC is L1 or L2 evidence, never L3: a mock proves HardKAS's behaviour around the mocked
boundary, not the external system.
