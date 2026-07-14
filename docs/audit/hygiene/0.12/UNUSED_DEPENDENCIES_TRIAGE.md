# Unused Dependencies Triage (Phase 4)

## Overview
This document categorizes the 105 unused dependencies and 19 unused devDependencies identified by Knip. Following the strict rules of Phase 4, we avoid blindly removing dependencies that might be used dynamically, required by tooling, or part of templates/labs.

### 1. Labs, Examples & Apps (Templates / Workspaces)
Dependencies in `labs/*`, `examples/*`, and `apps/*` are generally part of isolated environments, showcases, or experimental sandboxes. They often rely on dynamic loading or implicit usage.
**Action for all (85 dependencies in these folders)**: `KEEP_TEMPLATE` / `KEEP_TOOLING`.

### 2. Root Workspace (`package.json`)
| Dependency | Type | Reason | Action |
| ---------- | ---- | ------ | ------ |
| `kaspa` | dep | Core runtime / peer dependency | `KEEP_PEER` |
| `@hardkas/config` | devDep | Used in workspace scripts | `KEEP_TOOLING` |
| `c8` | devDep | Coverage tool | `KEEP_TOOLING` |
| `eslint-plugin-react` | devDep | Linter plugin | `KEEP_TOOLING` |
| `ts-node` | devDep | TypeScript execution | `KEEP_TOOLING` |
| `ws` | devDep | Implicitly used by node globals / testing | `NEEDS_REVIEW` |

### 3. Core Packages (`packages/*`)
| Package | Dependency | Type | Reason | Proposed Action |
| ------- | ---------- | ---- | ------ | --------------- |
| `@hardkas/cli` | `@kaspa/core-lib` | dep | CLI dynamic usage | `KEEP_RUNTIME_DYNAMIC` |
| `@hardkas/cli` | `@noble/hashes` | dep | CLI cryptography ops | `KEEP_RUNTIME_DYNAMIC` |
| `@hardkas/cli` | `open` | dep | CLI browser opening | `KEEP_RUNTIME_DYNAMIC` |
| `@hardkas/core` | `pino` | dep | Logger (dynamic) | `KEEP_OPTIONAL` / `KEEP_RUNTIME_DYNAMIC` |
| `@hardkas/dev-server` | `@hardkas/query` | dep | No obvious dynamic use | `NEEDS_REVIEW` (Candidate for `REMOVE_CONFIRMED`) |
| `@hardkas/kaspa-rpc` | `@hardkas/tx-builder` | dep | Broken test on removal | `HIDDEN_COUPLING_NEEDS_REVIEW` |
| `@hardkas/localnet` | `@hardkas/query` | dep | 0 references found in grep | `REMOVE_CONFIRMED` |
| `@hardkas/node-runner` | `@hardkas/core` | dep | 0 references found in grep | `NEEDS_PROOF` (testing) |
| `@hardkas/node-runner` | `@hardkas/config` | devDep | Build configuration | `KEEP_TOOLING` |
| `@hardkas/plugin-rpc-backend`| `@hardkas/core` | dep | Plugin architecture | `KEEP_PEER` / `KEEP_RUNTIME_DYNAMIC` |
| `@hardkas/query` | `picocolors` | dep | Terminal colors | `KEEP_RUNTIME_DYNAMIC` |
| `@hardkas/sdk` | `@hardkas/wallet-adapter`| dep | Public facade export? | `NEEDS_REVIEW` |
| `@hardkas/sdk` | `@kaspa/core-lib` | dep | Protocol definitions | `KEEP_PEER` |
| `@hardkas/simulator-adapters`| `@hardkas/core` | dep | Type re-exports? | `NEEDS_REVIEW` |
| `@hardkas/simulator-adapters`| `@hardkas/react` | dep | React bindings | `NEEDS_REVIEW` |
| `@hardkas/simulator-adapters`| `@hardkas/sdk` | dep | SDK bindings | `NEEDS_REVIEW` |
| `@hardkas/testing` | `@hardkas/kaspa-rpc` | dep | Test environment setup | `KEEP_TOOLING` |
| `@hardkas/testing` | `execa` | devDep | Spawning processes | `KEEP_TOOLING` |
| `@hardkas/query-store` | `tsup` | devDep | Bundler | `KEEP_TOOLING` |
| `@hardkas/react` | `@testing-library/jest-dom` | devDep | Testing | `KEEP_TOOLING` |
| `@hardkas/react` | `@testing-library/user-event` | devDep | Testing | `KEEP_TOOLING` |

### Candidates for Removal (`REMOVE_CONFIRMED` Evaluation)
After reviewing the packages, the following dependencies appear to be genuinely unused leftovers from refactoring (e.g. they aren't CLIs, aren't tooling, and aren't peers). We need to review them before marking as `REMOVE_CONFIRMED`:
1. `@hardkas/dev-server` -> `@hardkas/query`
2. `@hardkas/kaspa-rpc` -> `@hardkas/tx-builder`
3. `@hardkas/localnet` -> `@hardkas/query`
4. `@hardkas/node-runner` -> `@hardkas/core`
5. `@hardkas/sdk` -> `@hardkas/wallet-adapter`
6. `@hardkas/simulator-adapters` -> `@hardkas/core`, `@hardkas/react`, `@hardkas/sdk`
7. Root -> `ws` (devDep)
