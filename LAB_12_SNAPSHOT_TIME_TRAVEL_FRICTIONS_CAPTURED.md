# Lab 12: Snapshot / Time Travel Frictions Captured

This certifies that **Lab 12: Snapshot / Time Travel** has been built and executed, deliberately exposing the pain of manipulating the internal HardKAS state without a dedicated API.

The following operations have been proven to cause severe developer friction:
1. Copying `.hardkas` directory manually to take a snapshot.
2. Wiping and restoring directories to travel back in time.
3. Dealing with stale in-memory caches upon restoration.
4. Manually parsing JSON files to diff state.
5. Managing multiple branch directories to simulate network forks.

**Status**: READY FOR P46.1 (Time Travel / Snapshot Toolkit).
