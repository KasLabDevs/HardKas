$ErrorActionPreference = "Stop"

Write-Host "Running check-no-process-exit-in-logic.mjs..."
node scripts/check-no-process-exit-in-logic.mjs

Write-Host "Running check-no-console-in-logic.mjs..."
node scripts/check-no-console-in-logic.mjs

Write-Host "Running version:check..."
pnpm version:check

Write-Host "Running docs:check..."
pnpm docs:check

Write-Host "Running build..."
pnpm build

Write-Host "Running typecheck..."
pnpm typecheck

Write-Host "Running test..."
pnpm test

Write-Host "Running corpus:toccata..."
pnpm corpus:toccata

Write-Host "Running zk:corpus..."
pnpm zk:corpus

Write-Host "Running vprogs:check..."
pnpm vprogs:check

Write-Host "Running programmability:corpus..."
pnpm programmability:corpus

Write-Host "Running programmability:examples..."
pnpm programmability:examples

Write-Host "Running programmability:templates..."
pnpm programmability:templates

Write-Host "Running programmability:surface..."
pnpm programmability:surface

Write-Host "Running gauntlet:toccata..."
pnpm gauntlet:toccata

Write-Host "Running postrelease:break..."
pnpm postrelease:break

Write-Host "Running git diff --check..."
git diff --check

Write-Host "ALL GATES PASSED."
