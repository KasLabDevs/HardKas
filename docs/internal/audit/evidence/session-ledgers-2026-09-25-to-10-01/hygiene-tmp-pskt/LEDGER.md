# Test hygiene · pskt-cli temp dirs (2026-09-29)

Order (reviewer, relayed by the owner): "Haría que pskt-cli.test.ts use %TEMP%/os.tmpdir() con un directorio único y cleanup en finally, y eliminaría las cuatro carpetas temp_pskt_* versionadas." Own change, not mixed with testnet-11.

## Cause
- packages/cli/test/pskt-cli.test.ts:11 built its temp dir inside the source tree: `resolve(__dirname, "temp_pskt_<hex>")`, not gitignored. Cleanup in afterAll; a run interrupted (or a commit staged while the test runs) leaves files a commit picks up.
- Tracked leftovers: temp_pskt_09a68b02 (4fd4ed0ef, 2026-07-20), temp_pskt_41b37a57 (388c898d5, 07-21), temp_pskt_56131723 (346e9b60a, 07-24), temp_pskt_3724ffe9 (e52a4942d, 09-29, during my gate2). 16 files; key.txt / key2.txt = the test's "fake-key" / "fake-key-2" placeholders (checked by length only, never printed).
- Only in-tree writer: grep of packages/*/test for mkdirSync/writeFileSync/mkdtempSync with __dirname → none other; `git ls-files` → no other temp-like dirs under package tests.

## Change
- pskt-cli.test.ts: `tempDir = mkdtempSync(join(tmpdir(), "hardkas-pskt-cli-"))` in beforeAll (unique per run, outside the repo); afterAll removes it (vitest runs afterAll even when tests fail; the "finally" of a suite). randomBytes / mkdirSync imports dropped.
- The 4 dirs removed from the working tree with Remove-Item (no git rm; index is the owner's).
- The owner committed both in 44ed04f2e (13:01), together with the parallel session's audit/ move + orphan scripts + benchmarks/dag.bench.ts deletion (staged by them; not touched by me).

## Qualification
- targeted tmp-pskt-1: pskt-cli 13/13; afterwards 0 temp_pskt dirs in the repo, 0 hardkas-pskt-cli-* dirs left in %TEMP%.
- full gate on HEAD 44ed04f2e: phase1/tmp-pskt-gate1 → PASS first run: 901 files, 2046 tests, passed 2018 / failed 0 / pending 28, 740 s; non-loopback 0.
- regression proof: right after the full gate, `git status --short --untracked-files=all` empty, HEAD still 44ed04f2e, 0 hardkas-pskt-cli-* dirs left in %TEMP%.
