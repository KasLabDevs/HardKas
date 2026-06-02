# HardKAS 0.7.13-alpha — Command Coverage Phase 2b

**Total Commands Executed:** 52

| # | Label | Classification | Status | Error | 
|---|-------|----------------|--------|-------|
| 1 | npm-install | PASS | ✅ |  |
| 2 | cli-init | PASS | ✅ |  |
| 3 | seed-data | PASS | ✅ |  |
| 4 | query-store-doctor | PASS | ✅ |  |
| 5 | query-store-sync | PASS | ✅ |  |
| 6 | query-store-rebuild | PASS | ✅ |  |
| 7 | query-store-export | PASS | ✅ |  |
| 8 | query-store-sql | PASS | ✅ |  |
| 9 | query-lineage-chain | PASS | ✅ |  |
| 10 | query-lineage-transitions | PASS | ✅ |  |
| 11 | query-lineage-orphans | PASS | ✅ |  |
| 12 | tx-profile | FAIL_BUG | ❌ | [31m   ✗ Error:[39m [31m    Artifact at C:\User... |
| 13 | tx-status | PASS | ✅ |  |
| 14 | tx-receipt | PASS | ✅ |  |
| 15 | tx-batch | PASS | ✅ |  |
| 16 | verify-semantics | FAIL_BUG | ❌ | [31m   ✗ Error:[39m [31m    No torture reports ... |
| 17 | rebuild | PASS | ✅ |  |
| 18 | workflow-create | PASS | ✅ |  |
| 19 | workflow-run | PASS | ✅ |  |
| 20 | workflow-inspect | PASS | ✅ |  |
| 21 | workflow-replay | PASS | ✅ |  |
| 22 | workflow-diff | PASS | ✅ |  |
| 23 | sandbox | SKIP_LONG_RUNNING | ❌ | [Warning] Kaspa SDK (@kaspa/core-lib) is not insta... |
| 24 | sandbox-recipe | SKIP_LONG_RUNNING | ❌ | [Warning] Kaspa SDK (@kaspa/core-lib) is not insta... |
| 25 | localnet-snapshot-create | PASS | ✅ |  |
| 26 | localnet-snapshot-verify | FAIL_BUG | ❌ | [31m   ✗ Error:[39m [31m    Snapshot not found:... |
| 27 | localnet-snapshot-replay | FAIL_BUG | ❌ | [31m   ✗ Error:[39m [31m    Strict mode: corrup... |
| 28 | accounts-real-init | PASS | ✅ |  |
| 29 | accounts-real-generate | SKIP_NEEDS_SECRET | ✅ |  |
| 30 | artifact-create | WRONG_ARGS | ❌ | error: required option '--input <path>' not specif... |
| 31 | artifact-inspect | PASS | ✅ |  |
| 32 | artifact-explain | FAIL_BUG | ❌ | [31m   ✗ Error:[39m [31m      ✗ Economic invari... |
| 33 | artifact-verify | PASS | ✅ |  |
| 34 | artifact-lineage | PASS | ✅ |  |
| 35 | doctor | PASS | ✅ |  |
| 36 | status | PASS | ✅ |  |
| 37 | capabilities | PASS | ✅ |  |
| 38 | explain | PASS | ✅ |  |
| 39 | why | PASS | ✅ |  |
| 40 | test | FAIL_EXPECTED | ❌ | [31m   ✗ Error:[39m [31m    Test execution fail... |
| 41 | dev-tx-generate | PASS | ✅ |  |
| 42 | dev-fixture-generate | WRONG_ARGS | ❌ | error: required option '--type <type>' not specifi... |
| 43 | dev-server | SKIP_LONG_RUNNING | ✅ |  |
| 44 | dev-dashboard | SKIP_LONG_RUNNING | ✅ |  |
| 45 | bridge-local-plan | WRONG_ARGS | ❌ | error: required option '--amount <kas>' not specif... |
| 46 | bridge-local-simulate | WRONG_ARGS | ❌ | error: required option '--amount <kas>' not specif... |
| 47 | l2-networks | PASS | ✅ |  |
| 48 | l2-bridge-assumptions | PASS | ✅ |  |
| 49 | node-status | SKIP_EXTERNAL_NETWORK | ✅ |  |
| 50 | node-logs | SKIP_EXTERNAL_NETWORK | ✅ |  |
| 51 | rpc-health | SKIP_EXTERNAL_NETWORK | ✅ |  |
| 52 | rpc-info | SKIP_EXTERNAL_NETWORK | ✅ |  |
