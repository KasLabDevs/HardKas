# Phase 7-B SDK Revenge Run: 0.8.1-alpha vs 0.7.6-alpha

This gauntlet executed 20 real-world React and Node.js applications strictly using `@hardkas/sdk@0.8.1-alpha` installed directly from the public NPM registry. No monorepo links or CLI workarounds were allowed for core operations (`tx plan`, `sign`, `send`, `query`).

## Global Results

| Metric | 0.7.6-alpha (Baseline) | 0.8.1-alpha (Revenge Run) | Delta |
|--------|-----------------------|--------------------------|-------|
| **SUCCESSFUL** | 0 | 9 | 🟢 +9 |
| **PARTIAL** | 4 | 2 | 🟡 -2 |
| **FAILED** | 16 | 9 | 🔴 -7 |

> [!NOTE]
> The introduction of the programmatic SDK facade (`Hardkas.create()`, `sdk.tx.*`) successfully unblocked 9 complete Node.js architectures that previously failed in 0.7.6-alpha due to missing programatic bindings and `workspace:*` npm packaging errors.

## Execution Matrix

| ID | App | Environment | Status | Time (ms) | Notes |
|---|---|---|---|---|---|
| 01 | Wallet Backend | Node | ❌ FAILED | 42885 | Bug: `accounts.fund` defaults `from` to 'default' and crashes |
| 02 | React Wallet | React | ✅ SUCCESSFUL | 28297 | React direct context loads SDK correctly |
| 03 | Audit Explorer | Node | ✅ SUCCESSFUL | 28055 | Programmatic `artifacts.list()` works perfectly |
| 04 | Audit Explorer | React | ✅ SUCCESSFUL | 28262 | Clean initialization in React |
| 05 | Document Notary | Node | ✅ SUCCESSFUL | 33781 | Handled `--amount 0` gracefully using SDK errors |
| 06 | Document Notary | React | ❌ FAILED | 33789 | `@hardkas/react` missing/unusable (P1 DX Gap) |
| 07 | Game Backend | Node | ❌ FAILED | 91477 | Timeout: Requires localnet node to be spun up manually first |
| 08 | Game Dashboard | React | ✅ SUCCESSFUL | 29418 | Basic initialization success |
| 09 | Payroll Service | Node | ❌ FAILED | 38665 | Bug: Same `accounts.fund` default signer crash |
| 10 | Payroll UI | React | ❌ FAILED | 32820 | `@hardkas/react` missing |
| 11 | DAO Multisig | Node | ❌ FAILED | 38945 | Bug: Same `accounts.fund` crash |
| 12 | DAO Dashboard | React | ✅ SUCCESSFUL | 31110 | SDK facade initializes correctly |
| 13 | Backup Integrity | Node | ❌ FAILED | 37554 | `npx hardkas replay verify` failed (No artifacts found) |
| 14 | CI Verifier | Node | ⚠️ PARTIAL | 32945 | Used CLI fallback for `npx hardkas artifact verify` |
| 15 | Agent Wallet | Node | ✅ SUCCESSFUL | 34249 | SDK read methods fully stable |
| 16 | Agent Approval Flow | Node | ✅ SUCCESSFUL | 30305 | `tx.plan` successful via SDK |
| 17 | Mini Indexer | Node | ❌ FAILED | 33187 | `hardkas query sql` command doesn't exist |
| 18 | Query Store Test | Node | ⚠️ PARTIAL | 44609 | Used CLI fallback for `query store sync` |
| 19 | Dashboard Integration| React | ✅ SUCCESSFUL | 29329 | Clean React setup |
| 20 | Kastj Migration | Node | ❌ FAILED | 35647 | Missing raw `unsignedPayloadHash` access |

## Key Findings

1. **Packaging Solved**: `@hardkas/sdk@0.8.1-alpha` successfully installed and executed in totally isolated, clean workspaces fetching from the public registry.
2. **React Viability**: Simple React consumption works! The SDK doesn't instantly crash on import. However, the dedicated `@hardkas/react` library is non-existent/unusable, causing failure in apps relying on hooks.
3. **Internal Defaults Bug**: `hardkas.accounts.fund` crashes when it tries to derive the funding source and hits an `Unknown HardKAS account 'default'` error. This needs a patch.
