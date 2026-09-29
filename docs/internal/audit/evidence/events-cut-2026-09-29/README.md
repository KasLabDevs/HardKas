# Events cut, Surface Cut item 3 (2026-09-29 to 2026-10-02) — evidence

Item 3 of the post-cut inventory: event delivery and subscriptions. The live proofs showed that
`hardkas.events` never delivered, and that the kaspa-rpc and toolkit watches died on a node restart.
Item 3 is closed in develop:

- 3a: `c620edbff`.
- 3b: `watch()` on the official UtxoContext, committed as `a1e774f6e`.
- 3c-1 and 3c-2: `0f4c2f26b`.

Report: https://claude.ai/artifact/RSB6PGjpdFDNJB1XiSjwFA

Origin: session `21f9a2e4` scratchpad folders `cut6-events/`, `cut7-3c1/`, `cut8-3c2/` and
`evidence-archive/`. These were preserved on 2026-10-03.

## Read first

- `cut6-events/CUT-EVENTS-LEDGER.md`, `cut6-events/3b-WATCH-DESIGN.md`,
  `cut6-events/3b-GAP-EXPERIMENT-DESIGN.md`: the 3b gap record run (`UTXOCONTEXT_REQUIRED`) and its
  scripts.
- `cut7-3c1/LEDGER-3c1.md`, `cut8-3c2/LEDGER-3c2.md`: regressions before removal, packed tarballs in
  external npm and strict-pnpm consumers with an empty `HARDKAS_HOME`, and the gates. §9 of the 3c-2
  ledger holds the release-note text for the breaking 3c changes.
- `evidence-archive/hk-3a/` to `hk-3c2/`: the minimum package of the packed-consumer proofs:
  - final JSON reports;
  - before/after results;
  - consumer and tarball comparisons;
  - the SHA-256 of every tarball.

## Not copied (hash only, in `INVENTORY.tsv`)

- Two files larger than 1 MB.
- 18 `.err` captures and one `.diff`.

No key material was present.

`MANIFEST.sha256` lists the SHA-256 of every evidence file copied here; `INVENTORY.tsv` lists every file of the origin.

`.gitattributes` turns off git's end-of-line conversion here, so a checkout keeps the exact bytes that `MANIFEST.sha256` hashes.
