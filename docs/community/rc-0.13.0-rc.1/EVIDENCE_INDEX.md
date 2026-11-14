# HardKAS v0.13.0-rc.1 — Evidence Index

This index traces the public claims of the 0.13.0-rc.1 announcements (the progress report, the X post and the Discord message, which are not kept in this repository) back to their evidence, and, from row 26, the claims of the 0.13.0-rc.2 candidate.

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

## Update, 2026-11-13: the 0.13.0-rc.2 candidate

`0.13.0-rc.2` is **not published**. The rows below were produced with the code on `develop`, packed as the release would pack it (22 tarballs, 0 audit findings) or run from the repository's test suites. They change the status of rows 15–20 above; those rows are kept as they were for `0.13.0-rc.1`.

| # | Claim | Source | Environment | Date | Strength | Publish? | Qualification required |
|---|---|---|---|---|---|---|---|
| 26 | First ZK spends on Testnet-10: two proof-and-output-bound locks funded and spent to their bound payout | TN10 txs in the ZK appendix below; the node's answers; run JSON and network logs (only the public TN10 endpoint contacted) | Testnet-10 | 2026-11-13 | A + C | Yes, qualified | Experimental. Test funds. The 0.13.0-rc.2 candidate tarballs. HardKAS builds the lock and the spend; the run submitted the spend through the RPC client (HardKAS has no ZK broadcast command). No on-chain ZK verification claimed for HardKAS itself |
| 27 | Five invalid ZK spends rejected by the Testnet-10 node | the same run: payout one sompi short and another payee (`script ran, but verification failed`), a flipped proof byte (`ZK Integrity: ARK serialization error`), a valid proof of another program and the proof with another journal hash (`ZK Integrity: Groth16 verification failed`) | Testnet-10 | 2026-11-13 | A + C | Yes | A rejected spend and the valid one share a txid: a Kaspa txid does not cover the signature script |
| 28 | A second, independent RISC Zero receipt, made by HardKAS (H4) | [`fixtures/toccata-v2/zk/r0-groth16-hardkas`](../../../fixtures/toccata-v2/zk/r0-groth16-hardkas/README.md); [`zk-second-receipt-h4.test.ts`](../../../packages/sdk/test/zk-second-receipt-h4.test.ts); [`zk-output-bound-l1.simnet.test.ts`](../../../packages/sdk/test/zk-output-bound-l1.simnet.test.ts) now runs for both receipts (with `zk-toccata-l1`: 14/14 on rusty-kaspad 2.1.0 in Docker) | local / local simnet | 2026-11-13 | B | Yes | Its own guest program; risc0 3.0.5 crates with risc0-groth16 3.0.4 and recursion 4.0.4 (the versions rusty-kaspa 2.1.0 pins). Public since it was spent |
| 29 | The receipt's verifier parameters are checked against an upstream-computed value (H7) | `R0_GROTH16_VERIFIER_PARAMETERS_DIGEST` = risc0-zkvm's own `Groth16ReceiptVerifierParameters::default().digest()`; [`zk-h7-verifier-parameters.test.ts`](../../../packages/sdk/test/zk-h7-verifier-parameters.test.ts) | local | 2026-11-13 | B | Yes | — |
| 30 | Row 18 (`tx wait --address`, output spent since): FIXED AND VERIFIED | [`tx-wait-address-c3-int9.test.ts`](../../../packages/cli/test/tx-wait-address-c3-int9.test.ts) C3-10 / C3-11; on Testnet-10, from a keyless workspace with `--since`: the first ZK spend and the first funding, whose outputs to the funder were spent since by the second funding, both CONFIRMED in about 6 s (≈23,600 confirmations), the view proved by the later output `cf2346be…:1` (`utxoView.indexPastAcceptance`) | local / Testnet-10 | 2026-11-13 | A + B + C | Yes | When nothing at `--address` shows the node's index has passed the acceptance, the wait still ends `TX_WAIT_UTXO_VIEW_STALE`, now naming both causes. Without `--since`, a tx whose outputs at `--address` were spent still cannot be found from the node's sink (unchanged) |
| 31 | Row 19 (escrow refund retry): FIXED AND VERIFIED on a real node | [`v1-send.test.ts`](../../../packages/accounts/test/v1-send.test.ts) PF-9; [`construction-vectors-node.simnet.test.ts`](../../../packages/sdk/test/construction-vectors-node.simnet.test.ts) V-07 (8/8 on rusty-kaspad 2.1.0): the early reclaim through `sdk.covenants.send` is `SEQUENCE_LOCK_NOT_YET_MET` and nothing is recorded; the identical transaction (same txid) is accepted once the lock is met | local simnet | 2026-11-13 | B | Yes | Not re-run on Testnet-10 |
| 32 | Row 20 (`replay verify` message): FIXED AND VERIFIED | [`replay-real-node-1.test.ts`](../../../packages/sdk/test/replay-real-node-1.test.ts): a real-node send or plan is `REPLAY_MODE_UNSUPPORTED`, naming what it is | local | 2026-11-13 | B | Yes | — |
| 33 | Rows 16–17 ship in the rc.2 candidate | the candidate tarballs | local | 2026-11-13 | B | Yes | Still not in npm `0.13.0-rc.1` |
| 34 | Mainnet hardening for a future opening | unplanned mainnet sends refused permanently (`MAINNET_UNPLANNED_SEND_REFUSED`), `tx sign --allow-mainnet-signing` removed, `HARDKAS_KASPAD_IMAGE` must be pinned by digest everywhere a node is run from it; [CHANGELOG](../../../CHANGELOG.md) | local | 2026-11-11/13 | B | Yes | Mainnet stays blocked in this release line |
| 35 | The whole real-node ZK matrix of the Docker suites, repeated on Testnet-10 | the second ZK appendix below: a proof-only lock (7 invalid spends rejected, then the SDK's spend) and a proof-and-output-bound lock (4 invalid spends rejected, then two SDK bound spends); all 7 accepted transactions CONFIRMED with `tx wait`; HardKAS's own `ZkExecutionEvidence` artifact for each lock validates against its schema, outcome `ALL_AS_EXPECTED` | Testnet-10 | 2026-11-13 | A + C | Yes, qualified | Experimental. Test funds: 2.09 TKAS spent (0.59 in fees, 1.50000001 left locked on purpose). Only HardKAS's own receipt: the SDK refuses the official one on Testnet-10 (row 36). A proof-only lock is anyone-can-spend once its proof is public, and this proof already was: the lock held 1 TKAS for about 3 s |
| 36 | HardKAS refuses to build the ZK locks it cannot keep safe on a public network | the same run, before anything was sent: a proof-only Testnet-10 lock without `acknowledgeImageIdOnlyLock` (`ZK_IMAGE_ID_ONLY_LOCK_NOT_ACKNOWLEDGED`); the official receipt on Testnet-10, in both modes (`ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED`); a mainnet address (`MAINNET_SIGNING_DISABLED`); a spend of an input above the bound lock's limit (`ZK_BOUND_INPUT_ABOVE_LOCK_LIMIT`). The repository's ZK tests check the same codes | local (candidate tarballs) | 2026-11-13 | B + C | Yes | — |
| 37 | One proof spends every output of its lock | the same run: the output-bound lock's second output was spent with the same proof (`ca4ebcdd…8445`) | Testnet-10 | 2026-11-13 | A + C | Yes | By design: a proof is not tied to an outpoint. In proof-only mode a public proof empties every output of the lock; in output-bound mode each spend still pays only the bound output |
| 38 | Rule change after rows 35–36 (audit of 2026-11-13, C-1): HardKAS's own receipt is now treated as public | `PUBLIC_R0_TEST_VECTORS` is keyed on the image id and lists both receipts. On a public network a proof-only lock of a public program is refused (`ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED`), and a proof-and-output-bound lock of one is built with the warning `ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE`; [`zk-public-program-c1.test.ts`](../../../packages/sdk/test/zk-public-program-c1.test.ts) | local | 2026-11-13 | B | Yes | The proof-only Testnet-10 lock of row 35 could not be built again with the candidate as it now stands; rows 35–36 describe the code that ran them. The output-bound locks of rows 26 and 35 rebuild to the same bytes |

## Contradictions resolved

- **`actions/cache` pin.** The 9 November internal evaluation listed it as pending. The workflow file has carried the SHA pin since 2026-11-09, so the newer source wins: FIXED.
- **"No ZK on any network"** (an earlier internal remark) was imprecise. HardKAS does not broadcast ZK transactions, but its own test suite submits the ZK transactions HardKAS builds to a real local node. On Testnet-10 HardKAS refuses public test receipts by design; since 2026-11-13 a receipt HardKAS made itself (rows 26–28, 35–37) has been spent there, in both lock modes.
- **`develop` version.** `develop` now reads `0.13.0-rc.2`, but npm has only `0.13.0-rc.1`, re-checked 2026-11-11. Nothing on `develop` is published.
- **This index was written from the primary sources listed above**, not from an earlier progress report.

## Appendix: Testnet-10 transactions

All are on Testnet-10 (network id `testnet-10`), from 2026-11-11, with HardKAS `0.13.0-rc.1` installed from npm. Anyone can check them with a TN10 node, for example `hardkas tx status <txid> --network testnet-10`, or by searching the transaction id in a Testnet-10 block explorer.

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

## Appendix: ZK on Testnet-10 (2026-11-13, the 0.13.0-rc.2 candidate)

A RISC Zero Groth16 lock (`OpZkPrecompile`, Toccata) over the receipt HardKAS made itself (image id `04c1cd7c…d826`, journal hash `19c4db53…5592`), in proof-and-output-bound mode: the redeem script binds the spend to one output of 3 TKAS to the funding account, so a copy of the proof seen in the mempool can only pay that account. Lock address `kaspatest:prn9an3tkl9yfmhwyy4epe4gtgwx57q0q3t5vevafcfjhw7567wgz2rzjg5fd`; funding 3.19398720 TKAS each time (the payout plus a fee cap of 0.19398720 TKAS); compute mass 161,656.

| Step | Transaction ID | Result |
|---|---|---|
| Funding 1 | `4b14e00964452aa9319827719e993b1d818b9bbac4696f378b737304b0c882b2` (output 0) | confirmed |
| Payout one sompi short | `d162d49f891a861772fad807bf777410b5255b6403406951a00c95665ad8f927` | rejected by the node: `script ran, but verification failed` |
| Another payee | `90ba4d3b1b94aa82dc3bc41ced59166c5c3c84970598789af15b428b1b8ad8ca` | rejected by the node: `script ran, but verification failed` |
| One flipped proof byte | `4e8715ba…ea38` (the valid spend's txid) | rejected by the node: `ZK Integrity: ARK serialization error` |
| Valid spend 1 | `4e8715ba4e3bd1a2a27520e35b28b6a0b68d0b66f4bb266c7b0e83235ba3ea38` | confirmed; 3 TKAS to the funder |
| Funding 2 | `cf2346bed7da370f66d4aaab1d8866ee2f132d1ce0db5135cd1fbf4d6cf6fbbd` (output 0) | confirmed |
| A valid proof of another program (the public vector's) | `a62894a2…1355` (the valid spend's txid) | rejected by the node: `ZK Integrity: Groth16 verification failed` |
| The proof with another journal hash | `a62894a2…1355` (the valid spend's txid) | rejected by the node: `ZK Integrity: Groth16 verification failed` |
| Valid spend 2 | `a62894a26726372b5037076a7761005a74c1dfb143066c6eca43abd3869b1355` | confirmed; 3 TKAS to the funder |

## Appendix: the full ZK matrix on Testnet-10 (2026-11-13, second run)

The real-node cases of the repository's Docker suites (`zk-toccata-l1.simnet`, `zk-output-bound-l1.simnet`), run on Testnet-10 with the same receipt (rows 35–37). The node reported version 2.1.0. Two locks:
- **proof-only** (`IMAGE_ID_ONLY`, not consensus-enforced): `kaspatest:prtkd28x923j57v5tlgqx3qp8cepyufxljensehtl07w4g3jyrru70n09s9k5`, 1 TKAS.
- **proof-and-output-bound** (`IMAGE_ID_AND_OUTPUTS`): `kaspatest:pz9lzj3r3d27etm77ssm2l4saxy4tljl4d062uuw8fgshu22zqc0spkp2h22m`. It pays 1 TKAS to the funding account; each funding is 1.19398720 TKAS; the input limit is 1.5 TKAS.

Several rejected spends share a txid: the txid covers neither the signature script nor the compute budget. Rejected transactions are not on the network; their record is the node's answer in the run log.

| Step | Transaction ID | Result |
|---|---|---|
| Funding, output-bound lock (a) | `9ad64ade889189025e913f2d63587946508b762ce0f18c9581b876f7b2f90ca3` (output 0) | confirmed |
| Funding, output-bound lock (b) | `b6f59ad7e87be5591fcc2013726bb5162e08eb9e4372418d686d4d074c3a3609` (output 0) | confirmed |
| Funding above the limit (1.50000001 TKAS) | `3564d5077027239e49531beb14c074bc241da6e4eae42aa82e8902b1ffe1dfaf` (output 0) | confirmed; stays locked by design |
| Funding, proof-only lock | `cf9cff2617ebfbad99e5794b4c1a77a96ca94189f0b07bb7d2ae053a578a0753` (output 0) | confirmed (see the note below) |
| Proof-only: an outpoint that does not exist | `4d7961ae3459557a06da22e8b00ae59f78aec7e3a5c9238ef356c8f7c5f359d6` | rejected by the node: `is an orphan where orphan is disallowed` |
| Proof-only: compute budget 10 | `33818577cad41b57b426c33be89738d7e5d9ad1757dc3cafdc70ee0287618960` | rejected by the node: `script units exceeded the amount committed in the input: used=14002811, limit=109999` |
| Proof-only: 32 proof bytes replaced | `33818577…8960` | rejected by the node: `ZK Integrity: Groth16 verification failed` |
| Proof-only: another journal hash | `33818577…8960` | rejected by the node: `ZK Integrity: Groth16 verification failed` |
| Proof-only: the proof push cut short | `33818577…8960` | rejected by the node: `opcode requires 128 bytes, but script only has 40 remaining` |
| Proof-only: a version-0 transaction | `04a1e740aa8c0d9e49757390fc77024b1d227e5349de64bc16c79d5eb76399ef` | rejected by the node: `script units exceeded … limit=9999` |
| Proof-only: a fee of 0.005 TKAS | `7eb0b5ebcb4b7377cec4a755c355610197872785ca4d39456bfed1b018184639` | rejected by the node: `not standard: … 500000 fees which is under the required amount of 16152700` |
| Proof-only: the SDK's spend | `b4b62c7c8669abbd738b29d8ca820f1224ad3bd5ac6cbc7141a78024a6065ac0` | confirmed; 0.80609080 TKAS to the funder (fee 0.19390920, compute mass 161,591) |
| Output-bound: another payee | `0d9ff81da39f67a656ebbb389fae1a0602b91fc738c2c45a551974583445f0d6` | rejected by the node: `script ran, but verification failed` |
| Output-bound: payout one sompi short | `4f611f99cabe867b83a00175618dc8c85d9333a66ee54a2db6d75d88868320a9` | rejected by the node: `script ran, but verification failed` |
| Output-bound: two outputs of the lock in one spend | `6b2e4efe77bf12bc793d7d46aa1b615b17579e8afadfc796111c98382bbf757e` | rejected by the node: `script ran, but verification failed` |
| Output-bound: the input above the limit | `bba4e33644a52ad8bc8a7b9ffc78acdfd5f61f6de7a2e28668cea0b12155f614` | rejected by the node: `script ran, but verification failed` |
| Output-bound: the SDK's bound spend of (a) | `393233149a2c3b92a30633b141bf3abbd96a43ffbe64357f7dc8e254c9023ddb` | confirmed; 1 TKAS to the funder (fee 0.19398720) |
| Output-bound: the same proof, spending (b) | `ca4ebcdd2afcf53dc0533ea7b9333e16b00bdb28a6de457cb830ec4e1cbf8445` | confirmed; 1 TKAS to the funder |

**Note: confirming a transaction whose outputs were all spent since.** Confirmations were read with `hardkas tx wait --since <the sink before the run>`, from a keyless workspace (no submission, only the public endpoint).
- Six waits converged in 3–4 s.
- The proof-only funding, waited on at its lock address, ended `TX_WAIT_UTXO_VIEW_STALE` after 600 s. Its state was CONFIRMED (426 confirmations), but nothing at that address showed the node's index had passed the acceptance: the lock output was spent and the lock held nothing else. This is the limit row 30 describes.
- Waited on at its change address, it was CONFIRMED in 4 s.
