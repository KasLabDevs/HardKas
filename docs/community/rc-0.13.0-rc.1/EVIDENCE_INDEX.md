# HardKAS v0.13.0-rc.1 — Evidence Index

This index traces every public claim in the [progress report](PROGRESS_REPORT.md), the [X post](X_POST.md) and the [Discord announcement](DISCORD_ANNOUNCEMENT.md) back to its evidence.

**Evidence strength:**
- **A**: a node's own answer, or a public registry or CI record anyone can check;
- **B**: a reproducible test in this repository;
- **C**: a maintainer run log, kept in the maintainers' local evidence archive with SHA-256 manifests. Not in this repository.

**Sources:**
- [`CHANGELOG.md`](../../../CHANGELOG.md) and the [release notes](../../release/0.13.0-rc.1-notes.md) are repository documents.
- The maintainer archives are the Testnet-10 run of 2026-11-11 (manifest `da3e4ce4…` after the covenant step), the local simnet rehearsal, and the ZK and synthetic-wallet runs.
- No private keys, keystores, passwords or local paths are reproduced here.

## Claims

| # | Claim | Source | Environment | Date | Strength | Publish? | Qualification required |
|---|---|---|---|---|---|---|---|
| 1 | `0.13.0-rc.1` was published to npm, 22 packages | npm registry: dist-tags of all 22 `@hardkas/*` packages | npm | 2026-11-10 22:38 UTC; re-checked 2026-11-11 | A | Yes | `latest` = `next` = `0.13.0-rc.1` |
| 2 | The npm contents equal the audited tarballs | npm `dist.integrity` (sha512) vs the tarballs built from a clean clone of tag `v0.13.0-rc.1`; release tarball audit (22 tarballs, 0 findings) | npm / local | 2026-11-10 | A + C | Yes | — |
| 3 | The installed CLI reports `0.13.0-rc.1` and is byte-identical to the tarball | consumer install from npm: `hardkas --version`; `dist/` compared file by file (114/114) | local | 2026-11-11 | C | Yes | — |
| 4 | CI green on the release commit, on 3 operating systems | [commit `88f9fe8a3`](https://github.com/KasLabDevs/HardKas/commit/88f9fe8a3): 13/13 checks | GitHub Actions | 2026-11-10 | A | Yes | Ubuntu, Windows, macOS; also simnet, silverc, SilverScript runner, Docker suites, release tarballs, docs gates |
| 5 | L1 payment lifecycle on Testnet-10 (plan → sign → send → confirm → receipt → evidence) | TN10 transactions in the appendix; the node's answers; independent re-observation from a workspace with no keys | Testnet-10 | 2026-11-11 | A + C | Yes | Two test accounts; each broadcast authorized by a guard |
| 6 | Double spend rejected by the node | TN10 txs `c91f812b…` (confirmed) and `51a8f967…` (rejected: "orphan where orphan is disallowed"; never on chain) | Testnet-10 | 2026-11-11 | A | Yes | — |
| 7 | Batch payments, consolidation, `hardkas test` with evidence on TN10 | TN10 txs in the appendix | Testnet-10 | 2026-11-11 | A + C | Yes | — |
| 8 | `tx wait --address` from another workspace on TN10 | Run log: started before the send, CONFIRMED at the sender's accepting block; after the fact with `--lookback 10000`, CONFIRMED | Testnet-10 | 2026-11-11 | C | Yes | Default look-back ≈ 3 minutes on TN10; the spent-output case is OPEN (row 18) |
| 9 | Mainnet refused before any connection | `MAINNET_CONNECTION_DISABLED` in every run; network logs show 0 mainnet connections | local / Testnet-10 runs | 2026-11-10/11 | B + C | Yes | A deliberate boundary, not a missing feature |
| 10 | SilverScript deploy / unauthorized spend rejected / owner release on TN10 | TN10 txs `d61cbc8f…`, `04120749…`, `5ab19797…`, `8835a75a…`; node message "script ran, but verification failed" | Testnet-10 | 2026-11-11 | A | Yes | In `0.12.0-rc.28` HardKAS refused SilverScript on TN10 |
| 11 | Counter covenant (1:1) on TN10, wrong transition rejected | TN10 txs `bd439841…`, `40ab3a94…` (rejected, `SCRIPT_POLICY_REJECTED`), `a20e9987…`, `71cb4f57…` | Testnet-10 | 2026-11-11 | A | Yes | — |
| 12 | Five demo contracts with 1:1, 1:3, 2:1, 2:2, escrow time locks and KCC-20 on TN10 | 30 TN10 submissions (21 accepted and mined, 9 rejected); run JSON and table | Testnet-10 | 2026-11-11 | A + C | Yes | Built by the SDK v1 engine; the merchant demo's own panel simulates these contracts locally |
| 13 | All 8 attack scenarios rejected by the node | The same run | Testnet-10 (and local simnet) | 2026-11-11 | A | Yes | 2 of 8 are also refused by the engine; for those a deliberately forged tx was submitted to obtain the node's verdict |
| 14 | Five defects from the 24 Oct Testnet-10 run (H1–H5) no longer reproduce | 11-nov Testnet-10 run: `rpc health` uses the workspace node (H1); `ci verify` without Docker (H2); `run` reports the real error (H3); `why` names the submission (H4); test evidence records the node contact (H5) | Testnet-10 | 2026-11-11 | C | Yes | "No longer reproduce" in that run |
| 15 | ZK lock and spend against a real local node; 11 invalid cases rejected | [`zk-toccata-l1.simnet.test.ts`](../../../packages/sdk/test/zk-toccata-l1.simnet.test.ts), [`zk-output-bound-l1.simnet.test.ts`](../../../packages/sdk/test/zk-output-bound-l1.simnet.test.ts): 12/12; evidence outcome `ALL_AS_EXPECTED` | local simnet (`rusty-kaspad` 2.1.0) | 2026-11-11 | B | Yes, qualified | Experimental; a published test receipt; not on TN10 (HardKAS refuses it); HardKAS does not broadcast ZK itself; no proving, vProgs or L2 claim |
| 16 | `localnet fund` fix for long chains | develop commit `f05b3f9aa`; unit tests 17/17; real-node test 2/2 | local | 2026-11-11 | B | Yes | **Not in npm `0.13.0-rc.1`** |
| 17 | `security audit` no longer hangs on node data | develop commit `f05b3f9aa`; tests 70/70; 7.9 GB chain audited in 14 s | local | 2026-11-11 | B + C | Yes | **Not in npm `0.13.0-rc.1`** |
| 18 | Waiting for a tx whose output was spent: OPEN | reproduced on TN10 (`TX_WAIT_UTXO_VIEW_STALE` with `--since`; a full-timeout wait without it) | Testnet-10 | 2026-11-11 | C | Yes | — |
| 19 | Escrow refund retry after an early time-lock rejection: OPEN | reproduced on simnet and TN10 (`TX_ALREADY_SUBMITTED`) | both | 2026-11-11 | C | Yes | Workaround: re-plan with a higher fee |
| 20 | Replay message unclear: OPEN | `replay verify` on TN10 and simnet artifacts gives `REPLAY_MISSING_DEPENDENCY`; the help says replay is simulator-only | local | 2026-11-11 | C | Yes | The refusal itself is correct |
| 21 | KCC-20 from the CLI: UNKNOWN | not run in this round | — | — | — | Yes, as unknown | KCC-20 through the SDK: claim 12 |
| 22 | SilverScript runner tooling verification: OPEN | the CI level passes; verification as a tool pending | CI | 2026-11-10 | A (CI only) | Yes | — |
| 23 | `actions/cache` pinned by SHA: FIXED AND VERIFIED | [`.github/workflows/test-levels.yml`](../../../.github/workflows/test-levels.yml) (`actions/cache@caa2961…`, v5.1.0) | CI | 2026-11-09 | A | Yes | An older internal note listed it as pending |
| 24 | Internal maturity index 82.0% → 89.3% | 14 areas, weights sum to 25: 2051/25 and 2232/25 | internal | 2026-11-09 / 11 | internal judgment | Yes, qualified | Not an audit; not a certification; not feature completeness; not comparable with the 24 Oct dashboard (57%) |
| 25 | Synthetic test wallets: simnet only | `WalletToolkit`: create, receive, balance on a real local node; spend refused (`MISSING_SIGNER`); TN10 refused (`WALLET_SYNTHETIC_NETWORK_BLOCKED`) | local / Testnet-10 | 2026-11-11 | C | Yes | Not a BIP39/BIP32 HD wallet |

## Contradictions resolved

- **`actions/cache` pin.** The 9 November internal evaluation listed it as pending. The workflow file has carried the SHA pin since 2026-11-09, so the newer source wins: FIXED.
- **"No ZK on any network"** (an earlier internal remark) was imprecise. HardKAS does not broadcast ZK transactions, but its own test suite submits the ZK transactions HardKAS builds to a real local node. On Testnet-10 HardKAS refuses public test receipts by design.
- **`develop` version.** `develop` now reads `0.13.0-rc.2`, but npm has only `0.13.0-rc.1`, re-checked 2026-11-11. Nothing on `develop` is published.
- **The reference document `HardKAS_RC1_Progress_Report.docx` was not found** in the repository or on the maintainer's machine. This package was written from the primary sources listed above.

## Appendix: Testnet-10 transactions

All are on Testnet-10 (network id `testnet-10`), from 2026-11-11, with HardKAS `0.13.0-rc.1` installed from npm. Anyone can check them with a TN10 node, for example `hardkas tx status <txid> --network testnet-10`, or with a TN10 explorer: `[TN10_EXPLORER_URL]/txs/<txid>`.

**L1 payments**

| Step | Transaction ID | Result |
|---|---|---|
| One-command send, 10 TKAS | `03098ef3af2ebd63e5a8bc4cf406658003bf429e837d96a98ff8ce55532ca45d` | confirmed |
| Full payment, 10 TKAS | `8438c3578269b01fbee3cd5fd4c645ee63a11c58b895634fab5967e340ad210d` | confirmed |
| Double spend A, 5 TKAS | `c91f812b89e7b749011d41d73a7ba141e8746147a905906ca2340b1e1bc67322` | confirmed |
| Double spend B, 6 TKAS, same coin | `51a8f9673e5b79a522a1996dc2c04a71552845876356988da25e947be27604b0` | rejected by the node; never on chain |
| Batch payment 1 | `55ff36fee468bd63a6a0a816b6f1f726767374d8d838e1e6ee09e805b09333d8` | confirmed |
| Batch payment 2 | `3c441621ec88c52e2977bf4e2f2ca58a0a7d32143118642cfbc94800c867b0d5` | confirmed |
| Batch payment 3 | `99388aa412ffb5ea4d64fed27bbc722f1d638a691e99c8cff353a7c2e9d1dabc` | confirmed |
| `hardkas test` payment | `61cda3e003695a2c2022a1c97e7d7e75565cd3528d366fa4fbb888fbc3835efb` | confirmed |
| Consolidation, 4 coins into 1 | `e6e382df5551c46c93bf126225098340a954a3c79a65e6b90c0d6c9e35fd5eb0` | confirmed |
| Payment watched from another workspace | `ce03704b64aae6e938eac70c3fa3d7a5ff7de1b5fbd54769ea1e3488226dd5e1` | confirmed |

**SilverScript**

| Step | Transaction ID | Result |
|---|---|---|
| Deploy, 10 TKAS | `d61cbc8f5ab5c04ebdf724883011075e152353518ccd632476a333a7a3b62949` | confirmed |
| Owner release | `04120749e0339054764e92f131b7ba7cc190fd735cca067a65132a31a2310ddf` | confirmed |
| Deploy, 10 TKAS (second run) | `5ab197976ec23c5d2b5ccc049ccc703761fd2e4ba5ee40043073cbe65cbd5197` | confirmed |
| Intruder spend, then owner release | `8835a75aace320c27b2f068c0313c8002e813bd19c8d08ed696eaa89dc55765e` | the intruder's version was rejected; the owner's was confirmed (a Kaspa transaction ID does not cover signatures) |

**Counter covenant**

| Step | Transaction ID | Result |
|---|---|---|
| Genesis, 1 TKAS | `bd4398416dd34834b900237eae23cf58a2d9789d88f9b20b4c94e7e2e8c99e8b` | confirmed |
| Wrong successor state | `40ab3a94a75d6c5c146b27ab4320ab5ea96813b7d7a87c18ae6c329abec130ae` | rejected (`SCRIPT_POLICY_REJECTED`) |
| Bump 7 → 12 | `a20e9987f98eb1c56f712160c247aefc185bb5380977b29b78bbac6a4536a38f` | confirmed |
| Bump 12 → 17 | `71cb4f57ce88821f4165d3472b221fa951839cd621c8ab4a782dd85f76194c1b` | confirmed |

**The five demo contracts** (accepted and mined; the rejected attack transactions are in the maintainers' run JSON)

| Contract | Steps |
|---|---|
| TreasuryVault | genesis `280b04c6dc22692462fe8e82117f38dba005207c807369ae943dbc2c42747493`; disburse `e3e256f8fbe9ede5e3dce3a4e201498e1465313106cb83002b8c2caf926eb021`; govern `2d7aca3f525a3ea3c08e4fa99d0a44b002904ab8a074f237c4e70af4b3bec280`; terminate `a1c24b40e8a8e28a6b2bc284f4406def66d82733ebefb353ae0538df80ac090c` |
| PayrollFanout | genesis `31f67ad9de185eed890e8d987de530dec1239942910ce55bb80cd23f14cf9185`; 1:3 fan-out `2ce62481098a8a055085286779a848d9b62b88d97da6fecaeb5d4904fc45a7ec` |
| LiquidityPoolMatrix | genesis `558f818c178386fe3752b94c578be9044b9313671099c0b030bde75a05ed8d38`; split `1ccd464dc072ce530ddb82568e993516184e25bbb378a5c05027eb74efffbb76`; merge `1d967194c19265ee85df81f97c4b0cc23a603f6c4a5af5f971ba99254e2f59b7`; split `badc0ef5025bf189fbb7241a6ae4759b463c8afeb8444ddbd26cf3b44e4eaefc`; rebalance 2:2 `1969d422219ae9975696157d5a9a86db1d9e96f041d13ac94c681b23b74d60b9` |
| AtomicArbitratedEscrow | deposit `23d7cde64f47d9da33fd5f90f02fe970b39a4d23875b2cce3a5575a9b0744e53` → settle `82856f9c7868b493ae9ea8b99a6b7e9ff05e17e4acb0914a97022594db438231`; deposit `80be98d6c469e6a1cbb25c5faff057550397cfbca9ebfca3c8c8cbf819b397ab` → refund `f2b75aa7b5121cd86f446a9e8f1b273d4f529b6196b825e40dc62e47fc9a1607`; deposit `85aa0469abac0a16e21fd48087059eb70f628d138724274cd3f4752039fa26bf` → arbitrated release `2df2ecb2a5c0ef75e696f01f20b77547ac27504520ea3a48286f749249327182` |
| Kcc20Token | genesis `09767cecc37e6837dba6c1ef06e245e71399c32dffae565040b7b7bc7ed6c650`; mint `555b066eeea8b2840291e34da3e0c4feaa2d90acddc062d821ae0ea1611e5b57`; transfer `8957fc0ec17a40e80b662b59d4e3bb9969523aa6243bd936d4db62079216e31f`; burn `e6efd76a865955bd33ba2c253eb0419fafe07ef9f3c630f90be172ae2601c300` |
