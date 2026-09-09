# HardKAS 0.12 Knip Re-baseline (Post Phase 3A)

This report captures the state of unused code in the repository after executing Phase 3A, where 11 files identified as disconnected candidates were processed:
- **4 files were deleted permanently** (Root scratch files + `sdk/src/prune.ts`)
- **7 files were archived** (CLI runners and RPC adapters) to protect them against false positives or future need.

## Metrics Comparison

| Métrica                | Phase 1 | Phase 2 (Config) | Phase 3A (Triage Executed) |
| ---------------------- | ------: | ---------------: | -------------------------: |
| Unused files           |     228 |               83 |                         72 |
| Unused exports         |     398 |              398 |                        398 |
| Unused dependencies    |     107 |              105 |                        105 |
| Unused devDependencies |      20 |               19 |                         19 |

## Analysis of Remaining Metrics

### Unused Files (72)
We have successfully processed 11 files. The remaining 72 unused files are largely dynamic files, templates, examples, and labs that we have chosen to deliberately `KEEP` or `ARCHIVE` in place due to their utility or historical value. These require manual, deliberate triage if we ever want to reduce this number further, but they pose 0 risk to the build or the developer experience.

### Unused Exports (398)
As expected, this remains unchanged. These are public API surfaces exported by the packages but not consumed internally. Reviewing these will be the focus of **Phase 5**.

### Unused Dependencies (105)
Remaining unchanged. Reviewing these will be the focus of **Phase 4**.
