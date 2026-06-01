# SDK Gauntlet Report — 20 Apps

> Generated: 2026-06-01T12:31:11.711Z
> Total Gauntlet Run Duration: 125602ms (125.6s)
> Anti-Fake Guard: PASSED (Real command boots, physical artifact disk checks validated)

## Part A: Frozen SDK Gauntlet Metrics

### Summary Metrics

| Metric | SDK Outcomes | Status |
| :--- | :--- | :--- |
| **SUCCESSFUL Apps** | **0 / 20** | verified |
| **PARTIAL Apps** | **4 / 20** | documented |
| **FAILED Apps** | **16 / 20** | isolated |
| **Total Persisted L1 Artifacts** | **0** | cataloged |

### Per-App Telemetry Results

| ID | Name | Classification | Artifacts | SDK Imports | CLI Fallback | LoC | File Reads | Shell Calls | Missing APIs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| SDK-01 | Node Wallet Backend | FAILED | 0 | @hardkas/sdk | no | 42 | 0 | 0 | none |
| SDK-02 | React Wallet UI | FAILED | 0 | @hardkas/react, @hardkas/sdk | no | 78 | 0 | 0 | useWalletConnector, useTxSendHook |
| SDK-03 | Audit Explorer Node | FAILED | 0 | @hardkas/sdk | no | 35 | 3 | 0 | listArtifacts, getArtifactLineage |
| SDK-04 | Audit Explorer React | FAILED | 0 | @hardkas/sdk | no | 95 | 5 | 0 | listArtifacts, queryLocalStore |
| SDK-05 | Document Notary Node | FAILED | 0 | @hardkas/sdk | no | 50 | 0 | 0 | none |
| SDK-06 | Document Notary React | FAILED | 0 | @hardkas/react | no | 65 | 0 | 0 | useMetadataAnchor |
| SDK-07 | Game Backend | FAILED | 0 | @hardkas/sdk | no | 48 | 0 | 0 | dev.generateFixture |
| SDK-08 | Game Leaderboard React | PARTIAL | 0 | @hardkas/react | yes | 70 | 4 | 0 | useArtifactScanner |
| SDK-09 | Payroll Service Node | FAILED | 0 | @hardkas/sdk | no | 52 | 0 | 0 | batchTx |
| SDK-10 | Payroll Approval React | PARTIAL | 0 | @hardkas/react | yes | 85 | 0 | 0 | useTransactionApprovalFlow |
| SDK-11 | DAO Multisig Node | FAILED | 0 | @hardkas/sdk | no | 62 | 0 | 2 | signPartial, combineSignatures |
| SDK-12 | DAO Dashboard React | PARTIAL | 0 | @hardkas/react | yes | 74 | 6 | 0 | useMultisigScraper |
| SDK-13 | Backup Integrity Service | FAILED | 0 | @hardkas/sdk | no | 38 | 0 | 0 | none |
| SDK-14 | CI Artifact Verifier | FAILED | 0 | @hardkas/sdk | no | 44 | 0 | 0 | none |
| SDK-15 | Agent Wallet Node | FAILED | 0 | @hardkas/sdk | no | 46 | 0 | 0 | none |
| SDK-16 | Agent Approval Flow | PARTIAL | 0 | @hardkas/react | yes | 72 | 0 | 0 | useAgentApprovePortal |
| SDK-17 | Mini Indexer Service | FAILED | 0 | @hardkas/sdk | no | 55 | 4 | 0 | queryStore.getUtxos, queryStore.getTransactions |
| SDK-18 | Query Store SDK Test | FAILED | 0 | @hardkas/query-store | no | 40 | 2 | 0 | QueryStore.queryBalances, QueryStore.scanAddresses |
| SDK-19 | Dashboard Integration | FAILED | 0 | @hardkas/sdk | yes | 45 | 0 | 1 | Dashboard.bootServer |
| SDK-20 | Kastj Migration Spike | FAILED | 0 | @hardkas/sdk | yes | 154 | 8 | 4 | vault.createProposal, vault.fund, vault.finalize, vault.withdraw |
