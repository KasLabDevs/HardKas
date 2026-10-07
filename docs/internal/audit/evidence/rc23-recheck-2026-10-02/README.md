# rc.23 audit re-check (2026-10-02) — preserved records

The executed re-check of the 2026-09-25 rc.23 release audit (AUD-01…45) against HEAD `0f4c2f26b`,
made by Claude session `98415136` on 2026-10-02. Its working folder was `%TEMP%\claude\audit-compare`,
which Windows empties after about seven days. Preserved on 2026-10-03 by session `21f9a2e4`, on the
reviewer's instruction to keep these records out of `%TEMP%` (copies of the small files, hashes of
everything).

## Files here

- `MANIFEST.sha256`: SHA-256 of every evidence file copied here (not of this README or the inventories). Check it with `sha256sum -c MANIFEST.sha256`,
  or in PowerShell with `Get-FileHash -Algorithm SHA256`.
- `INVENTORY.tsv`: every file of the original folder, with its size and SHA-256, and whether it was
  copied or excluded (with the reason).
- `SKIPPED-DIRS.tsv`: directories not walked (the localnet node's chain data): file count and bytes.
- `audit-compare/run/`: build, typecheck, docs checks, `version:check`, the clean-clone install and build,
  and the hermetic gate twice: with the pinned kaspa-wasm home (`gate-wasm.log`) and with an empty
  `HARDKAS_HOME` (`gate-empty.log`).
- `audit-compare/check.mjs`, `audit-compare/gen.ts`: the re-check's scripts.
- `cli-workspaces.tar.gz`: the `cli/` workspaces of the integrity and CLI probes (tampered artifacts,
  the workspaces they were run in, `cli/LOG.md`). It is packed because the artifact file names exceed
  the Windows path limit inside this repository. Each member's SHA-256 is in `INVENTORY.tsv` under
  `audit-compare/cli/...`.
- `localnet-workspace.tar.gz`: the `.hardkas/` artifacts of the re-check's localnet project
  (observations, submissions, receipts), without the node's chain data and without its accounts file.
  It is packed because this repository ignores every `.hardkas/` directory. Its members are listed in
  `INVENTORY.tsv` under `audit-compare/localnet/proj/.hardkas/...`.

## Not copied (hash only, in `INVENTORY.tsv`)

- Key material: three `accounts.real.json` with throwaway plaintext keys. Never copied, also not
  inside the tar.
- `run/pskt-head.node`: the native PSKT binary rebuilt from source (AUD-32 evidence). Its hash is the
  evidence.
- Toolchain homes (official kaspa-wasm 2.1.0 asset copies), the frozen-lockfile check workspace
  (copies of the repository manifests; its result is `run/clone-install.log`), databases and lock
  files. The node's chain data (164 MB) was not walked.

## What the re-check concluded (its own summary, session 98415136)

> Executed: build + typecheck EXIT 0; hermetic gate with product-installed kaspa-wasm = 2038/0/28,
> 0 non-loopback; empty home = 313 failed (green still needs kaspa-wasm in HARDKAS_HOME); clean clone
> `--frozen-lockfile` install + build EXIT 0 (AUD-01 closed). Build rewrites the tracked pskt-native
> .node with a different hash (AUD-32 confirmed).
> Fixed: AUD-01/02/03-06/07-12/14/15/17/18/19/21/27/28/31/37/38/45, CLI quickstart narratives.
> Integrity attacks all rejected by the real CLI.
> Still open: all docs (40/241 invalid invocations, overclaims, Toccata errors; only planning.md
> fixed), AUD-16, 20, 24, 25, 26, 29, 30, 33, 39, 42, 43, 44, DEF-22/23, Zod "[object Object]",
> docs:check-claims stale.
> New: encrypted real accounts cannot `tx sign`; generate without TTY exits 0 + stale lock;
> `hardkas verify` fails after the suggested `replay verify`; [REDACTED] masks txids/hashes;
> `localnet stop` says "Simulated" and doesn't stop toccata; status miscounts; BOM JSON rejected.

Item-by-item comparison against develop `b66eda874` (2026-10-03): 26 fixed, 3 partial, 22 open, no
critical open. Page: https://claude.ai/artifact/XQQ3iCgmKdQQdJcfQC8jwz

Logs contain absolute local paths of the machine they ran on; they are kept unmodified.

`.gitattributes` turns off git's end-of-line conversion here, so a checkout keeps the exact bytes that `MANIFEST.sha256` hashes.
