# WORKSPACE-AUTHORITY-2 · C-A qualification chain (no full gate): the focused AFTER (the two WA2 files), then the
# related sets — config + accounts + sdk (whole hermetic test dirs), then the CLI files that plan/sign/send, open the SDK
# or read the execution contract. Each run through run-files-wt.ps1 (hermetic, logged, kept).
$ErrorActionPreference = "Continue"
$S = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut48-workspace-authority-2"
$wt = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"

Write-Output "===== wa2-after-1 (focused) ====="
& powershell -NoProfile -ExecutionPolicy Bypass -File "$S\run-files-wt.ps1" -Repo $wt -Tag "wa2-after-1" -Files "packages/sdk/test/workspace-authority-2.test.ts,packages/cli/test/workspace-authority-2.test.ts" 2>&1 | Select-Object -Last 30

Write-Output "===== wa2-related-a-1 (config + accounts + sdk) ====="
& powershell -NoProfile -ExecutionPolicy Bypass -File "$S\run-files-wt.ps1" -Repo $wt -Tag "wa2-related-a-1" -Files "packages/config/test,packages/accounts/test,packages/sdk/test" 2>&1 | Select-Object -Last 40

$cli = @(
  "wave1-3-cli-helpers", "event-ledger-2", "event-ledger-2-json-contract", "event-ledger-2-flow", "demo-cut-t-a14b-tx-status",
  "wave2-e-send-outcome", "wave1-3-verify-cli", "verify-exit-crash", "json-stream-1", "r0-cli-lifecycle", "r0b-resource-lifecycle",
  "surface-truth-1b-contract", "surface-truth-1", "surface-truth-1a-contract", "replay-trust-2", "wa1-root-reads",
  "workspace-authority-1", "evidence-trust-1-contract", "json-papercuts", "evidence-trust-1", "deploy-path-containment",
  "workflow-simulated", "workflow-corpus", "wave7-replay-mode-guard", "wave8-single-envelope", "wave2-c-pending-spend",
  "wave1-5-narratives-cli", "wave2-b-planner-convergence", "wave1-2-next-steps", "tx-simulated", "tx-flow-outcome",
  "tx-command-lock-scope", "simulator-state-evidence-cli", "simulator-state-writers", "simulated-isolation",
  "simulator-durable-execution-cli", "localnet-fund-race", "first-contact-small-fixes", "execution-guard-runners",
  "e2e-simulated", "demo-ready-e21-plan-path", "demo-ready-e02-live-dag-planning", "demo-cut-t-a14b-no-false-claims",
  "demo-cut-e04-cli-balances", "cli-semantics", "bom-user-json", "batch-exit-status", "accounts-secrets-wave",
  "accounts-balance-local", "account-hardening", "help-truth", "secret-surface-2"
) | ForEach-Object { "packages/cli/test/$_.test.ts" }
Write-Output "===== wa2-related-b-1 (cli, $($cli.Count) files) ====="
& powershell -NoProfile -ExecutionPolicy Bypass -File "$S\run-files-wt.ps1" -Repo $wt -Tag "wa2-related-b-1" -Files ($cli -join ",") 2>&1 | Select-Object -Last 40
