# TESTNET-PORT-COLLISION-1: related batches (endpoint resolution touches config, SDK, CLI runners, kaspa-rpc, tq).
param([string]$Suffix = '1')
$ErrorActionPreference = 'Continue'
$r = Join-Path $PSScriptRoot 'run-tests.ps1'
& $r -Tag "tpc-related-pkgs-$Suffix" -Files 'packages/config/test,packages/core/test,packages/accounts/test,packages/sdk/test,packages/toolkit/test,packages/kaspa-rpc/test,packages/testnet-qualification/test,packages/node-orchestrator/test'
$names = @(
  'account-hardening','accounts-balance-local','accounts-real-query','accounts-secrets-wave','broadcast-guard','cli-contract-2','cli-contract-2a',
  'demo-cut-e04-cli-balances','demo-cut-t-a14b-tx-status','demo-cut-t-a14b-no-false-claims','demo-ready-e02-live-dag-planning','demo-ready-e20-account-names',
  'demo-ready-e21-plan-path','demo-ready-e26-simulated-balance-identity','deploy-path-containment','deploy','deployment-locking',
  'e2e-real-accounts','endpoint-authority-1','event-ledger-2-flow','event-ledger-2-json-contract','event-ledger-2','evidence-trust-1-contract',
  'evidence-trust-1','first-contact-e03-tasks','first-contact-newcomer','first-contact-small-fixes','help-truth','kaspa-rpc-url','localnet-fork',
  'node-network-identity','r0b-resource-lifecycle','rpc-commands','security-integration-1','task-evidence-unbound-1','testnet-port-collision-1',
  'tx-command-lock-scope','tx-flow-outcome','tx-simulated','tx-verify-tx-version','wave1-2-next-steps','wave2-b-planner-convergence',
  'wave2-e-send-outcome','workflow-corpus','workspace-authority-1','workspace-authority-2','secret-surface-2',
  'public-surface','root-commands','smoke','surface-truth-1'
)
$cli = $names | ForEach-Object { "packages/cli/test/$_.test.ts" } | Where-Object { Test-Path (Join-Path 'C:\Users\jrodr\hkl1\tpc\src' $_) }
& $r -Tag "tpc-related-cli-$Suffix" -Files ($cli -join ',')
& $r -Tag "tpc-related-other-$Suffix" -Files 'packages/testing/test,packages/dev-server/test,packages/node-runner/test,packages/localnet/test,packages/query/test,packages/artifacts/test'
'RELATED DONE'
