$ErrorActionPreference = "Stop"

Write-Host "Starting 3000 Targeted Chaos Campaign..."
node packages/cli/dist/index.js chaos --runs 3000 --seed 1337 --profile targeted

Write-Host "Starting 2000 LockHell Campaign..."
node packages/cli/dist/index.js chaos --runs 2000 --seed 404 --actor LockHell

Write-Host "All campaigns completed!"
