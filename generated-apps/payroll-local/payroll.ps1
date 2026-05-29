Write-Host "=== Funding Employer ==="
hardkas accounts fund alice

Write-Host "=== Paying Employee 1 (bob) ==="
hardkas tx plan --from alice --to bob --amount 10 --out p1.json
hardkas tx sign p1.json
hardkas tx send p1.json

Write-Host "=== Paying Employee 2 (carol) ==="
hardkas tx plan --from alice --to carol --amount 10 --out p2.json
hardkas tx sign p2.json
hardkas tx send p2.json

Write-Host "=== Paying Employee 3 (dave) ==="
hardkas tx plan --from alice --to dave --amount 10 --out p3.json
hardkas tx sign p3.json
hardkas tx send p3.json

Write-Host "=== Querying Artifacts ==="
hardkas query artifacts

Write-Host "=== Querying Events ==="
hardkas query events

Write-Host "=== Querying Lineage for p1.json ==="
hardkas query lineage p1.json
