# SNAPSHOT_RUNTIME_HARDENED

**The Snapshot Toolkit has been officially hardened.**

1. **Build & Test**: The global workspace builds cleanly and all toolkit tests pass.
2. **Partial Restore Failure**: Validated that malicious/failing participants abort the restoration gracefully and surface specific error messages instead of silently corrupting state.
3. **Missing Participant**: Validated that a restoration halts explicitly if the target state includes a participant that hasn't been registered in the current runner.
4. **Deterministic Diff**: Verified that `snapshots.diff()` accurately detects state changes using deep content hashes.
5. **Filesystem Manifest**: Ensured that the `.hardkas-snapshots/<id>/manifest.json` complies with `hardkas.snapshot.v1` and captures the appropriate `stateHashes` efficiently.
6. **Documentation**:
   - Wrote example snippet: `docs/examples/api/snapshot-toolkit.ts`
   - Added Builder Book chapter: `docs/book/chapter-10-snapshot-time-travel.md`
