# Session ledgers, 2026-09-25 to 2026-10-01

The ledgers and design notes of the work done by session `21f9a2e4` between the rc.23 remediation and
the Surface Cut. They were kept in that session's scratchpad in `%TEMP%`, which Windows empties after
about seven days. The oldest folder had already reached that age. Only the Markdown files are copied
here. Every other file of those folders is listed in `INVENTORY.tsv` with its size and SHA-256:
logs, JSON results, scripts, and the published-candidate tarballs of the rc.24 qualification.
`node_modules` directories were not walked.

| Folder | Work |
|---|---|
| `wave1/` | rc.23 remediation Wave 1: security fixes and integrity ledgers |
| `wave2/` | Wave 2: Q4 transaction states (tx status / tx wait derivation) |
| `first-contact/` | First-contact block of the rc.23 user-style test |
| `demo/`, `demo-cut/` | Demo script and checklist; demo-cut step 2 (T-A14b) |
| `rc24/` | rc.24 qualification and publication |
| `reuse-audit/`, `poc/` | Reuse audit and substitution proofs of concept |
| `v210/` | rusty-kaspa / kaspa-wasm 2.1.0 pin and E39 |
| `phase1/`, `phase2/`, `phase3/` | Surface Cut phases 1–3: RPC transport, planner on the Generator, Silver runner |
| `cut4-netparams/`, `cut5-deadcode/`, `hygiene-tmp-pskt/` | Network parameters from the SDK, dead-code removal, a hygiene note |

The ledgers record decisions and results as they happened. Statements in them are as of their date,
and later work may have superseded them.

`MANIFEST.sha256` lists the SHA-256 of every evidence file copied here; `INVENTORY.tsv` lists every file of the origin.

`.gitattributes` turns off git's end-of-line conversion here, so a checkout keeps the exact bytes that `MANIFEST.sha256` hashes.
