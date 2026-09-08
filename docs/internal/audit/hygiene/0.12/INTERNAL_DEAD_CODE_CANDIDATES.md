# Internal Dead Code Candidates (Phase 3 Triage)

This document classifies the 83 files reported by Knip in Phase 2. Files marked as `DELETE_CONFIRMED` are safe to delete. Files marked as `KEEP_*`, `ARCHIVE`, or `NEEDS_REVIEW` will NOT be deleted in this automated phase.

| Archivo | Paquete | Motivo Knip | Export público | Dynamic import | Tests/docs | Acción |
| ------- | ------- | ----------- | -------------- | -------------- | ---------- | ------ |
| `apps/dashboard/src/App.css` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/ActivityFeed.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/Layout.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/LineageGraph.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/ProvenanceGraph.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/ProvenancePanel.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/ReplayBadge.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/Sidebar.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/components/StatusBadge.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/AccountsPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/ArtifactDetailPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/ArtifactsPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/BridgePage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/EventsPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/OverviewPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/ReplayPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/TransactionDetailPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/TransactionsPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/WalletsPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/pages/WorkflowsPage.tsx` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `apps/dashboard/src/styles/variables.css` | dashboard | Unused app file | No | Vite entry | Sí | `KEEP_DYNAMIC` |
| `examples/showcase-suite/packages/shared-backend/src/setup.ts` | showcase-suite | Unused example | No | No | Sí | `KEEP_FIXTURE` |
| `examples/showcase-suite/playwright.config.ts` | showcase-suite | Unused example | No | No | Sí | `KEEP_FIXTURE` |
| `examples/showcase-suite/scripts/api-coverage-analyzer.ts` | showcase-suite | Unused example | No | No | Sí | `KEEP_FIXTURE` |
| `examples/showcase-suite/test-sse.js` | showcase-suite | Unused example | No | No | Sí | `KEEP_FIXTURE` |
| `hardkas.config.ts` | root | Unused config | No | Sí | No | `KEEP_DYNAMIC` |
| `labs/02-merchant-checkout/src/domain/CheckoutService.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/08-full-stack-demo/public/app.js` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/10-wallet-optimizer/hardkas.config.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/11-dag-explorer/src/services/DAGService.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/11-dag-explorer/src/services/TraceService.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/11-dag-explorer/src/store/ExplorerStore.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-fetch.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-l1-flow.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-l1-full-cycle.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-official-sdk.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-raw-rpc.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-raw-wrapped.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-raw-ws.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-submit-raw.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-submit-sdk.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-submit-wrpc.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/test-wrpc-payload.ts` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `labs/16-full-docker-runtime-gauntlet/tests/full-docker-gauntlet.test.js` | labs | Unused lab | No | No | No | `ARCHIVE` |
| `packages/cli/src/commands/query/artifacts.ts` | cli | Query command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/commands/query/correlate.ts` | cli | Query command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/commands/query/dag.ts` | cli | Query command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/commands/query/lineage.ts` | cli | Lineage command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/commands/query/replay.ts` | cli | Replay command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/commands/query/rpc.ts` | cli | Query command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/commands/query/store.ts` | cli | Query command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/commands/query/ui-helpers.ts` | cli | Query command | No | Sí | No | `NEEDS_REVIEW` |
| `packages/cli/src/define-config.ts` | cli | Internal helper | Sí | No | Sí | `KEEP_PUBLIC_API` |
| `packages/cli/src/public.ts` | cli | Public exports | Sí | No | Sí | `KEEP_PUBLIC_API` |
| `packages/cli/src/runners/example-list-runner.ts` | cli | Dead runner | No | No | No | `ARCHIVE (executed)` |
| `packages/cli/src/runners/example-run-runner.ts` | cli | Dead runner | No | No | No | `ARCHIVE (executed)` |
| `packages/cli/src/runners/replay-runner.ts` | cli | Replay runner | No | No | No | `NEEDS_REVIEW` |
| `packages/cli/src/runners/snapshot-restore-runner.ts` | cli | Dead runner | No | No | No | `ARCHIVE (executed)` |
| `packages/cli/src/runners/trace-runner.ts` | cli | Trace runner | No | No | No | `ARCHIVE (executed)` |
| `packages/cli/src/runners/tx-receipts-runner.ts` | cli | Dead runner | No | No | No | `ARCHIVE (executed)` |
| `packages/cli/src/runners/workflow-create-runner.ts` | cli | Workflow runner | No | No | No | `NEEDS_REVIEW` |
| `packages/cli/src/templates/basic.ts` | cli | Template | No | Sí | No | `KEEP_FIXTURE` |
| `packages/cli/src/templates/workflows.ts` | cli | Template | No | Sí | No | `KEEP_FIXTURE` |
| `packages/core/src/contracts.ts` | core | Core schema | Sí | No | Sí | `KEEP_PUBLIC_API` |
| `packages/dev-server/src/routes/activity.ts` | dev-server | API Route | No | Sí | No | `NEEDS_REVIEW` |
| `packages/dev-server/src/routes/deployments.ts` | dev-server | API Route | No | Sí | No | `NEEDS_REVIEW` |
| `packages/dev-server/src/routes/replay.ts` | dev-server | API Route | No | Sí | No | `NEEDS_REVIEW` |
| `packages/kaspa-rpc/src/adapters/index.ts` | kaspa-rpc | RPC Adapters | Sí | No | Sí | `KEEP_PUBLIC_API` |
| `packages/kaspa-rpc/src/adapters/rpcBlockToDagBlock.ts` | kaspa-rpc | RPC Adapter | No | No | No | `ARCHIVE (executed)` |
| `packages/kaspa-rpc/src/adapters/rpcUtxoToWalletUtxo.ts` | kaspa-rpc | RPC Adapter | No | No | No | `ARCHIVE (executed)` |
| `packages/query/src/adapters/rpc-adapter.ts` | query | Query adapter | No | No | No | `NEEDS_REVIEW` |
| `packages/query/src/correlate.ts` | query | Query logic | No | No | No | `NEEDS_REVIEW` |
| `packages/query/src/events.ts` | query | Query logic | No | No | No | `NEEDS_REVIEW` |
| `packages/sdk/src/prune.ts` | sdk | Old logic | No | No | No | `DELETE_CONFIRMED (executed)` |
| `packages/testing/src/invariants.ts` | testing | Test util | No | No | Sí | `KEEP_FIXTURE` |
| `packages/testing/src/mass-setup.ts` | testing | Test util | No | No | Sí | `KEEP_FIXTURE` |
| `packages/testing/src/scenarios.ts` | testing | Test util | No | No | Sí | `KEEP_FIXTURE` |
| `packages/testing/src/torture/environment-buckets.ts` | testing | Test util | No | No | Sí | `KEEP_FIXTURE` |
| `test-localnet.ts` | root | Scratch file | No | No | No | `DELETE_CONFIRMED (executed)` |
| `test-wasm-rpc-cjs.js` | root | Scratch file | No | No | No | `DELETE_CONFIRMED (executed)` |
| `test-wasm-rpc.ts` | root | Scratch file | No | No | No | `DELETE_CONFIRMED (executed)` |
| `vendor/kaspa-wasm/kaspa_bg.wasm.d.ts` | root | WASM Loader | Sí | Sí | Sí | `KEEP_PUBLIC_API` |
| `vendor/kaspa-wasm/kaspa.d.ts` | root | WASM Loader | Sí | Sí | Sí | `KEEP_PUBLIC_API` |

### Delete Confirmed Evidence
These 11 files are fully detached from the codebase:
- `packages/cli/src/runners/example-list-runner.ts`
- `packages/cli/src/runners/example-run-runner.ts`
- `packages/cli/src/runners/snapshot-restore-runner.ts`
- `packages/cli/src/runners/trace-runner.ts`
- `packages/cli/src/runners/tx-receipts-runner.ts`
- `packages/kaspa-rpc/src/adapters/rpcBlockToDagBlock.ts`
- `packages/kaspa-rpc/src/adapters/rpcUtxoToWalletUtxo.ts`
- `packages/sdk/src/prune.ts`
- `test-localnet.ts`
- `test-wasm-rpc-cjs.js`
- `test-wasm-rpc.ts`

**Evidence for DELETE_CONFIRMED files:**
- `rg <filename>` references: 0 (verified unimported)
- `package.json` scripts: 0 
- Public exports: 0
- Docs references: 0
