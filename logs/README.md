# `logs/`: retired merchant-compatibility results. Not evidence.

**Status: INVALID EVIDENCE. Do not cite these files.** They are kept unchanged as a record of the defect that the
2026-11-06 audit reported (HK-07, SIM-12) and the counter-audit extended (CA-EV-06). Removing them needs the owner's
authorization.

| File | Produced by | Commit | Run |
| :-- | :-- | :-- | :-- |
| `logs/merchant-compat-simulator.jsonl`, `-simnet.jsonl`, `-testnet.jsonl` | retired v1 battery (`scripts/run-merchant-compatibility-battery.mjs`) | `b36117860` | 2026-11-03 23:55 UTC |
| `logs/merchant-compatibility-results.json` | the earlier v2 battery | `b36117860`, `c383daf77` | 2026-11-04 09:28 and 09:43 UTC |
| `merchant-compatibility-summary.md`, `-inventory.md`, `-failures.md`, `-matrix.csv` (repository root) | the earlier v2 battery, from the results.json above | `b36117860` | 2026-11-04 |

## Why none of the rows counts as evidence

None of the rows stores the response it claims to have observed, the command that ran or a check that can be re-run.
`node scripts/run-merchant-compatibility-battery-selftest.mjs` shows that both files fail the current checker
(evidence log `evidence/fix/D-10-battery-selftest2.log` of the 2026-11-06 repair).

**v1 jsonl** (174 rows, 141 with `durationMs: 0`). The script started every row as PASS and wrote fixed texts:
- simulator: 41 PASS rows with a fixed text where nothing ran: OP-02, 05, 08, 12, 15, 19-22, 26-32, 34-58. The other 17 called the simulator (OP-01, 03, 04, 06, 07, 09-11, 13, 14, 16-18, 23-25, 33), and OP-33 used a forged covenant id;
- simnet: 31 PASS rows with a fixed text where nothing ran, e.g. "Rejected by rusty-kaspad VM" and "matching rusty-kaspad sighash": OP-02, 04, 05, 07, 09, 10, 12, 14-16, 19-24, 26-34, 53-58. Another 18 PASS rows came from a `getInfo` call (OP-35-52: "evidence pack", "ci verify", "security audit"…), and 3 came from the node rejecting an invented orphan (OP-17, 18, 25, "tx send"). Only OP-01, 06, 08, 11 and 13 called something that matched the operation;
- testnet: 41 PASS rows, all with a fixed text, and all 58 rows have 0 ms. Nothing connected to testnet.

**Earlier v2 results.json / md / csv** (only partly corrected). These rows are PASS without executing the named operation:
- simulator: OP-12 (no SDK call); OP-14 and 23 (listed UTXOs, built no plan); OP-15 (fixed mass `200/1000/700/1900`); OP-19, 20, 21, 26 and 27 (`CONFIRMED`, `confirmations: 2` and `accepted: true` written by hand); OP-24 and 25 (named `sdk.*`, the SDK was never called); OP-32 ("owner spend": spent a P2PK UTXO of Alice, not the contract); OP-33 (covenant genesis with a forged id that the node would reject, HK-03); OP-34 (copied the covenant and fell back to any UTXO of Bob);
- simnet: OP-02, 28 and 29 (static text); OP-10 (offline derivation); OP-19, 20, 26 and 27 (only `getSink`/`getSinkBlueScore`); OP-37 (a `ping`); OP-33 (a negative v0+covenant probe, not a genesis);
- testnet: OP-28, 29, 49 and 55 marked `OFFLINE_PASS` with nothing executed.

The rows that did run something (simulator OP-01, 03, 04, 06, 07, 09, 11, 16-18, 22, 28-31; simnet OP-01, 06, 08, 11, 13)
hold evidence objects written by the script, with no stored response, so they cannot be re-checked either.

These sentences of `merchant-compatibility-summary.md` are false: "Eliminación Total de Falsos PASS", "OP-32 ejecuta
la liberación autorizada del contrato" and "OP-33 y OP-34 … con verificación de covenantId inmutable". So is v1's
"100% idénticas entre Simulator y Simnet". Neither battery could run on another machine: both used absolute paths of
the owner's machine (`C:\Users\…\.hardkas\…`, `D:\proyectos\merchant-demo-rc28\…`) and started rusty-kaspad by tag,
without a digest, published on `0.0.0.0:18210`.

## What replaces them

`scripts/run-merchant-compatibility-battery-v2.mjs` (rules and checker: `scripts/run-merchant-compatibility-battery-evidence.mjs`):
- a row is PASS only when a declared executor ran the named operation. The row must keep the command, the measured
  duration and the stored observed response (`outputs/<env>/<OP>.json`, bound to the run id), with checks that the
  checker re-evaluates on that file. The verdict text is generated from the response;
- everything else is `NOT_EXECUTED` with a reason code (no `OFFLINE_PASS`, `NOT_IMPLEMENTED`, `SKIP`, `BLOCKED` or
  `NOT_TESTED`);
- the simnet node is the isolated reference rusty-kaspad of `@hardkas/testing` (by digest, on 127.0.0.1, on a free
  port, removed at the end), and toolchains come from the managed HARDKAS_HOME;
- each run writes to its own directory (default `.hardkas/merchant-compat/<runId>`, ignored by git), never into `logs/`
  or the repository root.

`scripts/run-merchant-compatibility-battery-selftest.mjs` checks the rules. Every PASS of the simulator column comes
from `@hardkas/simulator`, which is an approximate model, not consensus evidence (`docs/status/limitations.md`).
