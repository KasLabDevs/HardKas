# EVENT-LEDGER-2 · move the isolated worktree hk-ra to current develop (71ff614f9 = rc.27 content) and rebuild.
# Only hk-ra is touched (its own detached HEAD + build outputs); the owner's checkout, index and branches are not.
$ErrorActionPreference = "Continue"
$env:GIT_OPTIONAL_LOCKS = "0"
$wt = "C:\Users\jrodr\AppData\Local\Temp\hk-ra\wt"
$log = "C:\Users\jrodr\AppData\Local\Temp\claude\C--Users-jrodr-Documents-kaslabdevs-GitHub-HardKas-repo\21f9a2e4-33ac-4300-9366-aff402f85900\scratchpad\cut46-event-ledger-2\logs"
New-Item -ItemType Directory $log -Force | Out-Null
"start $(Get-Date -Format o)" | Out-File -Encoding utf8 "$log\prep-wt.log"
git -C $wt checkout --detach 71ff614f96b1a3bbbe7fc80607fefb08ee60e3e7 *>> "$log\prep-wt.log"
"HEAD now $(git -C $wt rev-parse HEAD) tree $(git -C $wt rev-parse 'HEAD^{tree}')" | Out-File -Append -Encoding utf8 "$log\prep-wt.log"
Push-Location $wt
pnpm exec turbo build --concurrency 1 *> "$log\build-71ff614f9.log"
"build exit=$LASTEXITCODE" | Out-File -Append -Encoding utf8 "$log\prep-wt.log"
Pop-Location
# tracked outputs the build rewrites (labs/showcase-suite compiled JS, the pskt-native .node) go back to HEAD's bytes
$dirty = git -C $wt status --porcelain
"dirty after build: $(@($dirty).Count)" | Out-File -Append -Encoding utf8 "$log\prep-wt.log"
$dirty | Out-File -Append -Encoding utf8 "$log\prep-wt.log"
git -C $wt checkout -- packages/pskt-native labs/showcase-suite *>> "$log\prep-wt.log"
"status after restore: $(@(git -C $wt status --porcelain).Count) lines" | Out-File -Append -Encoding utf8 "$log\prep-wt.log"
"cli --version: $(node "$wt\packages\cli\dist\index.js" --version 2>&1)" | Out-File -Append -Encoding utf8 "$log\prep-wt.log"
"end $(Get-Date -Format o)" | Out-File -Append -Encoding utf8 "$log\prep-wt.log"
