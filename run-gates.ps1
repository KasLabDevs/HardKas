node scripts/check-silver-no-shell-exec.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/check-forbidden-claims.mjs --self-test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/check-forbidden-claims.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/check-query-store-security.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/check-artifact-registry.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm --filter @hardkas/artifacts test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm --filter @hardkas/core test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm --filter @hardkas/sdk test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm --filter @hardkas/cli test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm corpus:toccata
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm zk:corpus
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm vprogs:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm programmability:corpus
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm programmability:surface
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm gauntlet:toccata
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm postrelease:break
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git diff --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

echo "All gates passed!"
