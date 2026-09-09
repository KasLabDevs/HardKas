# Framework Frictions Discovered

During the implementation of App 4 (Treasury), the following architectural friction was discovered:

## 1. Missing `.resumePendingJobs()` in `JobsToolkit`
**Description**: The `JobsToolkit` handles storing jobs continuously. However, if a node crashes, the internal `JobRunner` did not provide a public method to re-hydrate and resume jobs that were left in a `running` or `pending` state upon a fresh boot. Calling `jobs.enqueue` just created new jobs.
**Resolution**: We patched `JobRunner` in `@hardkas/jobs` to include a `resumePendingJobs()` method, and exposed it through the `JobsToolkit` public API. Phase 2 of the Treasury App successfully verified this fix by resuming a job that had crashed exactly at a 1-second checkpoint.
