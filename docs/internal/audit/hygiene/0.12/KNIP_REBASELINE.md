# HardKAS 0.12 Knip Re-baseline (Phase 2)

This report captures the true extent of unused code in the repository after correctly configuring `knip.ts` to recognize all entry points (apps, templates, examples, labs, tests, and fixtures). 

The goal of this phase was to eliminate false positives before proceeding to the actual code pruning in Phase 3.

## Metrics Comparison

| Métrica                | Antes (Fase 1) | Después de configurar entrypoints |
| ---------------------- | -------------: | --------------------------------: |
| Unused files           |            228 |                                83 |
| Unused exports         |            398 |                               398 |
| Unused dependencies    |            107 |                               105 |
| Unused devDependencies |             20 |                                19 |

## Analysis of Remaining Metrics

### Unused Files (83)
The number of unused files dropped dramatically from 228 to 83. The remaining files fall into these categories and will be evaluated in Phase 3:
1. **Confirmed Internal Dead Code:** Files from old SDK versions (`0.8.x`, `0.9.x`) that are completely detached from the import tree.
2. **Historical Labs / Benchmarks:** Some isolated files in `benchmarks/` or deep inside old labs that are not imported anywhere and were not caught by the broad `labs/**` pattern if they lack exports.
3. **Template Assets:** Assets or data files inside templates/fixtures that aren't imported via TS imports.

### Unused Exports (398)
This number remained mostly unchanged because Knip correctly identifies these as exports from `packages/*` that are not consumed by any other file *within this monorepo*. 
- **Public API:** Many of these are legitimate public API surfaces intended for external consumers (e.g. interfaces, plugins, RPC types).
- **Public API Review Required:** In Phase 5, we will manually classify each of these as `keep`, `internalize`, `deprecate`, or `remove-in-major`.

### Unused Dependencies (105)
A slight drop. The remaining dependencies need manual review in Phase 4. Many could be:
- Dynamically loaded plugins.
- Peer dependencies.
- Implicitly required by build tooling.

## Conclusion
The configuration of entry points successfully shielded our showcases, templates, and examples from being falsely flagged as dead code. The remaining 83 files are much safer candidates for Phase 3 review.
