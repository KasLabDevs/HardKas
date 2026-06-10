$ErrorActionPreference = "Stop"
pnpm version:check
if ($LASTEXITCODE -ne 0) { Write-Host "version:check failed"; exit 1 }

pnpm docs:check
if ($LASTEXITCODE -ne 0) { Write-Host "docs:check failed"; exit 1 }

pnpm build
if ($LASTEXITCODE -ne 0) { Write-Host "build failed"; exit 1 }

pnpm typecheck
if ($LASTEXITCODE -ne 0) { Write-Host "typecheck failed"; exit 1 }

pnpm test
if ($LASTEXITCODE -ne 0) { Write-Host "test failed"; exit 1 }

pnpm corpus:toccata
if ($LASTEXITCODE -ne 0) { Write-Host "corpus:toccata failed"; exit 1 }

pnpm zk:corpus
if ($LASTEXITCODE -ne 0) { Write-Host "zk:corpus failed"; exit 1 }

pnpm vprogs:check
if ($LASTEXITCODE -ne 0) { Write-Host "vprogs:check failed"; exit 1 }

pnpm programmability:corpus
if ($LASTEXITCODE -ne 0) { Write-Host "programmability:corpus failed"; exit 1 }

pnpm programmability:examples
if ($LASTEXITCODE -ne 0) { Write-Host "programmability:examples failed"; exit 1 }

pnpm programmability:templates
if ($LASTEXITCODE -ne 0) { Write-Host "programmability:templates failed"; exit 1 }

pnpm programmability:surface
if ($LASTEXITCODE -ne 0) { Write-Host "programmability:surface failed"; exit 1 }

pnpm gauntlet:toccata
if ($LASTEXITCODE -ne 0) { Write-Host "gauntlet:toccata failed"; exit 1 }

pnpm postrelease:break
if ($LASTEXITCODE -ne 0) { Write-Host "postrelease:break failed"; exit 1 }

git diff --check
if ($LASTEXITCODE -ne 0) { Write-Host "git diff --check failed"; exit 1 }

Write-Host "ALL GATES PASSED"
