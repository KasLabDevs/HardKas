param([string]$Suffix = '1')
$ErrorActionPreference = 'Continue'
$r = Join-Path $PSScriptRoot 'run-tests.ps1'
& $r -Tag "mg-related-core-acc-sdk-$Suffix" -Files 'packages/core/test,packages/accounts/test,packages/sdk/test,packages/toolkit/test,packages/kaspa-rpc/test,packages/testnet-qualification/test'
$cli = @('account-hardening','accounts-balance-local','accounts-real-query','accounts-secrets-wave','broadcast-guard','cli-contract-2','cli-contract-2a','demo-cut-t-a14b-tx-status','demo-cut-t-a14b-no-false-claims','demo-ready-e21-plan-path','e2e-real-accounts','event-ledger-2-flow','event-ledger-2-json-contract','event-ledger-2','first-contact-e03-tasks','first-contact-newcomer','first-contact-small-fixes','help-truth','r0b-resource-lifecycle','rpc-commands','tx-command-lock-scope','tx-flow-outcome','tx-simulated','tx-verify-tx-version','wave1-2-next-steps','wave1-5-narratives-cli','wave2-b-planner-convergence','wave2-e-send-outcome','workflow-corpus','workspace-authority-1','workspace-authority-2') | ForEach-Object { "packages/cli/test/$_.test.ts" }
$cli = $cli | Where-Object { Test-Path (Join-Path 'C:\Users\jrodr\hkl1\mg\src' $_) }
& $r -Tag "mg-related-cli-$Suffix" -Files ($cli -join ',')
& $r -Tag "mg-related-pkgs-$Suffix" -Files 'packages/testing/test,packages/dev-server/test,packages/node-runner/test,packages/localnet/test,packages/query/test,packages/artifacts/test'
'RELATED DONE'
