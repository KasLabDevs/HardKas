# SDK Frictions Document

This document records the frictions discovered during the execution of Builder Labs.
When a friction occurs organically multiple times (e.g. across 2 or 3 labs), it becomes a candidate for infrastructure helper extraction in the SDK.

## Discovered in Lab 07 (Batch Engine)

- **JobRunner / State Machine**: Handling async background tasks in the same process requires tracking `pending`, `running`, `completed`, and `failed` states.
- **JobCheckpoint**: Persisting execution cursors manually via JSON feels rudimentary and requires error-prone filesystem logic.
- **RetryPolicy**: Backoff and delay logic for transient errors.
- **ProgressReporter / BatchCursor**: Calculating progress percentage, tracking total vs processed, and maintaining cursor state for iterative logic across reboots/failures.

> These frictions have been intentionally implemented ad-hoc in Lab 07.

## Discovered in Lab 08 (Full Stack Demo)

- **JobRunner / State Machine (Reappearance)**: To connect a UI progress bar to the reconciliation logic without blocking the Fastify event loop, the entire `JobRunner` suite had to be re-introduced inside the monolithic application.
- **ProgressReporter (Reappearance)**: Tracking percentages in the frontend explicitly required the JSON-serializable `ProgressReporter`.

**Conclusion**: The repeated need for robust background task orchestration, state persistence, and progress reporting across fundamentally different types of applications (a dedicated batch engine vs an interactive dashboard) provides solid justification for extracting these primitives into `@hardkas/jobs` (Helper Extraction Round 3).
