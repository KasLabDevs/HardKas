$ErrorActionPreference = "Stop"

pnpm gauntlet:toccata
pnpm postrelease:break
node scripts/check-forbidden-claims.mjs --self-test
node scripts/check-forbidden-claims.mjs
node scripts/check-artifact-registry.mjs
node scripts/check-packaging-smoke.mjs
node scripts/check-dev-server-security.mjs
node scripts/check-typescript-hygiene.mjs

Write-Host "ALL CHECKS PASSED SUCCESSFULLY"
