# HardKas README vs CLI Mismatch Audit

## Scope
This audit compares HardKas's public and technical documentation with the actual command registration in Commander.
Sources analyzed:
- `README.md` (Root)
- `docs/cli.md` (Advanced user guide)
- `docs/query-layer.md`
- `docs/what-actually-works.md` (Stability status)
- `packages/cli/src/commands/*` (Real source code)
- `packages/cli/src/index.ts` (CLI entry point)

## Method
1. All commands mentioned in the documentation were extracted.
2. They were compared with the actual registration in `index.ts` and their respective command files.
3. Flags, arguments, and functional states (Verified, Partial, Mock, etc.) were verified.
4. Internal suggestions in the code pointing to non-existent commands were identified.

## 1. Documented Commands Inventory

| Source | Documented Command | Context | Documented Flags | Status in real CLI | Note |
| :--- | :--- | :--- | :--- | :--- | :--- |
| README.md | `hardkas init` | Quickstart | — | **EXISTS** | Supports optional `[name]` in code. |
| README.md | `hardkas node start` | Quickstart | — | **EXISTS** | Supports `--image` in code. |
| README.md | `hardkas accounts list` | Quickstart | — | **EXISTS** | Supports `--json`, `--config`. |
| README.md | `hardkas tx send` | Quickstart | `--from, --to, --amount` | **EXISTS** | Supports many more flags (url, network, etc). |
| README.md | `hardkas test` | Quickstart | — | **EXISTS** | Recently migrated from Mock to real Vitest. |
| README.md | `hardkas artifact verify` | Quickstart | `--recursive` | **EXISTS** | Supports `--json`, `--strict`. |
| README.md | `hardkas example list` | Quickstart | — | **EXISTS** | Registered in `misc.ts`. |
| docs/cli.md | `hardkas doctor` | Diagnostics | — | **EXISTS** | Real and functional command. |
| docs/cli.md | `hardkas query store sync` | Store Sync | — | **EXISTS** | Suggested as `sync` or `rebuild` in code and docs. |
| docs/cli.md | `hardkas query store sql` | Raw Query | — | **EXISTS** | Recently implemented raw SQL query. |
| docs/cli.md | `hardkas tx trace` | Tracing | `<txId>` | **DISABLED** | Registered but intentionally blocked. |

## 2. Real CLI Commands Missing From Docs

| Group | Real command | Functional status | Source file | Should be documented in | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| query | `hardkas query store rebuild` | 🟢 VERIFIED | `query.ts` | `docs/cli.md` | **HIGH** |
| query | `hardkas query events` | 🟢 VERIFIED | `query.ts` | `docs/query-layer.md` | **HIGH** |
| accounts| `hardkas accounts real [command]` | 🟢 VERIFIED | `accounts.ts` | `README.md` (Keystore) | **MEDIUM** |
| faucet | `hardkas faucet` | 🟢 VERIFIED | `faucet.ts` | `README.md` | **MEDIUM** |
| snapshot| `hardkas snapshot [command]` | 🟡 PARTIAL | `snapshot.ts` | `docs/cli.md` | **MEDIUM** |
| config | `hardkas config show` | 🟢 VERIFIED | `config.ts` | `README.md` | **MEDIUM** |
| replay | `hardkas replay verify` | 🟢 VERIFIED | `replay.ts` | `docs/cli.md` | **LOW** |
| l2 | `hardkas l2 [command]` | 🟡 PARTIAL | `l2.ts` | `docs/l2-guide.md` (TBD) | **MEDIUM** |
| run | `hardkas run` | 🟢 VERIFIED | `run.ts` | `README.md` | **HIGH** [NEW] |

## 3. Documented But Not Registered

| Documented command | Source | Why it is a problem | Recommended action |
| :--- | :--- | :--- | :--- |
| `hardkas query store index` | `docs/cli.md`, `doctor.ts` | [OUTDATED FINDING RESOLVED] | Command and docs are now aligned to `rebuild`. |
| `hardkas query store sql` | `docs/cli.md` | Unfulfilled promise of functionality. | Remove from docs or mark as Roadmap. |
| `pnpm example:ci` | `README.md` | Not verified if `package.json` script exists. | Validate scripts in `packages/cli/package.json`. |

## 4. Registered But Incorrectly Documented

| Command | Docs say | Code says | Difference | Recommended action |
| :--- | :--- | :--- | :--- | :--- |
| `hardkas init` | `hardkas init` | `hardkas init [name]` | Supports project name. | Update README. |
| `hardkas tx send` | Basic flags | Extensive flags | Missing `--network`, `--url`, `--yes`. | Update README or reference `--help`. |
| `hardkas test` | — | `--network, --watch, --json` | Network capabilities not mentioned. | Document that it uses Vitest. |

## 5. Status Mismatch

| Command | Real status | How it appears in docs | Risk | Recommended action |
| :--- | :--- | :--- | :--- | :--- |
| `hardkas tx trace` | ⚫ DISABLED | As "star" feature | **HIGH** (Disappointment) | Mark as "Coming Soon" or disable mention. |
| `hardkas accounts real lock`| 🟠 MOCK | As security feature | **MEDIUM** (False security) | Warn that it is a session simulation. |
| `hardkas test` | 🟢 VERIFIED | Without clear status | **LOW** | Indicate that it is now real and uses Vitest. |
| `Query Store (SQLite)` | 🟢 VERIFIED | "STABLE" [OUTDATED FINDING RESOLVED] | Updated in `what-actually-works.md`. |

## 6. README Gaps
- **Lack of clarity on installation**: Does not mention that Docker is required for `hardkas node start`.
- **Lack of Scopes explanation**: Does not explain the difference between `@hardkas/sdk` and `@hardkas/cli`.
- **Lack of Status Badges**: Commands do not have `stable/preview/research` tags in the README.
- **Lack of Query documentation**: The README does not mention the SQLite introspection engine.
- **Lack of Mainnet warning**: `Mainnet Guards` protection should be more prominent.

## 7. Conceptual Diff

### Add to docs
- `hardkas query store rebuild` (Replaces `index`). [DONE]
- `hardkas query events` (Powerful debug tool). [DONE]
- `hardkas faucet` (Essential for dev workflow). [DONE]
- `hardkas config show` (Useful for environment debug). [DONE]
- `hardkas run` (Execute scripts). [NEW]

### Remove or mark as roadmap
- `hardkas query store sql` (Remove from current user guide).
- `hardkas tx trace` (Mark as temporarily disabled).

### Correct
- `query store index` references -> `query store rebuild`.
- `hardkas init [name]` arguments.

### Warn
- `hardkas accounts real lock` is only cosmetic.
- `hardkas l2` is experimental.

## 8. Recommendations

### Critical
1. **Sync `index` -> `rebuild`**: This is the most visible mismatch causing direct user errors.
2. **Update `what-actually-works.md`**: The Query Store IS already connected. Keeping it as "Broken" discourages the use of one of the best features in the repo.

### High
1. **Generate CLI Reference**: Automate documentation generation from the Commander registry to avoid future desynchronization.
2. **Badge Status in README**: Copy badges from `cli-command-status.md` to the Quickstart section.

## Checklist
- [x] Extract README commands
- [x] Compare with Commander registry
- [x] Detect non-existent documented commands
- [x] Detect undocumented real commands
- [x] Generate final diff
- [x] No modifications to runtime logic
- [x] No modifications to source code

## Guardrails
- No modifications to runtime logic.
- No modifications to commands.
- No modifications to runners.
- No modifications to internal packages.
- Comparison was made against the actual command registry and previous audits.
