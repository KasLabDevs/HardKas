$ErrorActionPreference = "Stop"

Write-Host "Checking process exit logic..."
node scripts/check-no-process-exit-in-logic.mjs

Write-Host "Checking console logic..."
node scripts/check-no-console-in-logic.mjs

Write-Host "Checking silver no-shell exec..."
node scripts/check-silver-no-shell-exec.mjs

Write-Host "Testing @hardkas/core..."
pnpm --filter @hardkas/core test

Write-Host "Testing @hardkas/cli..."
pnpm --filter @hardkas/cli test

Write-Host "Running all tests..."
pnpm test

Write-Host "Typechecking..."
pnpm typecheck

Write-Host "Building..."
pnpm build

Write-Host "Running corpus:toccata..."
pnpm corpus:toccata

Write-Host "Running gauntlet:toccata..."
pnpm gauntlet:toccata

Write-Host "Running postrelease:break..."
pnpm postrelease:break

Write-Host "Checking git diff..."
git diff --check

Write-Host "ALL PHASE 4 GATES PASSED."
