# TASK-EVIDENCE-UNBOUND-1: related batches (the packages the fix touches and those reading scenario results/packages).
param([string]$Suffix = '1')
$ErrorActionPreference = 'Continue'
$r = Join-Path $PSScriptRoot 'run-tests-teu2.ps1'
& $r -Tag "teu2-related-pkgs-$Suffix" -Files 'packages/artifacts/test,packages/sdk/test,packages/core/test,packages/testing/test,packages/query-store/test,packages/query/test,packages/accounts/test'
$names = @(
  'first-contact-e03-tasks','first-contact-newcomer','first-contact-small-fixes','surface-truth-1','surface-truth-1a-contract','help-truth',
  'cli-contract-2','cli-contract-2a','evidence-trust-1','evidence-trust-1-contract','event-ledger-2','event-ledger-2-flow','event-ledger-2-json-contract',
  'event-ledger-2-report','workflow-corpus','security-integration-1','endpoint-authority-1','node-network-identity','r0b-resource-lifecycle',
  'tx-flow-outcome','wave2-e-send-outcome','workspace-authority-2','task-evidence-unbound-1'
)
$cli = $names | ForEach-Object { "packages/cli/test/$_.test.ts" } | Where-Object { Test-Path (Join-Path 'C:\Users\jrodr\hkl1\teu2\src' $_) }
& $r -Tag "teu2-related-cli-$Suffix" -Files ($cli -join ',')
'RELATED DONE'
