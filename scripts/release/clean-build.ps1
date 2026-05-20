$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== HardKAS Clean Build ==="

$Workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Workspace

# 1. Clean build artifacts
Write-Host "Cleaning build artifacts..."
Get-ChildItem -Path "packages","apps","examples" -Directory | ForEach-Object {
    $distDir = Join-Path $_.FullName "dist"
    if (Test-Path $distDir) {
        Remove-Item $distDir -Recurse -Force
        Write-Host "  Removed: $distDir"
    }
}

if (Test-Path ".turbo") {
    Remove-Item ".turbo" -Recurse -Force
    Write-Host "  Removed: .turbo"
}

Get-ChildItem -Recurse -Filter "*.tsbuildinfo" | Remove-Item -Force
Write-Host "  Removed: *.tsbuildinfo"

# 2. Reinstall
Write-Host ""
Write-Host "Reinstalling dependencies..."
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

# 3. Build
Write-Host ""
Write-Host "Building..."
pnpm build
if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }

# 4. Typecheck
Write-Host ""
Write-Host "Typechecking..."
pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw "pnpm typecheck failed" }

# 5. Test
Write-Host ""
Write-Host "Running tests..."
pnpm test
if ($LASTEXITCODE -ne 0) { throw "pnpm test failed" }

# 6. Verify npm pack
Write-Host ""
Write-Host "Verifying npm pack (dry-run)..."
Set-Location (Join-Path $Workspace "packages/cli")
$packOutput = npm pack --dry-run 2>&1
Write-Host $packOutput

$forbidden = @("node_modules", ".hardkas", "store.db", ".fuzz", ".crash")
foreach ($pattern in $forbidden) {
    if ($packOutput -match $pattern) {
        throw "npm pack contains forbidden path: $pattern"
    }
}

Set-Location $Workspace

Write-Host ""
Write-Host "=== Clean Build PASSED ==="
