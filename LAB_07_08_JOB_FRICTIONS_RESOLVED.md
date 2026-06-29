# LAB 07 & 08 JOB FRICTIONS RESOLVED

The frictions documented in `FRICTIONS.md` regarding ad-hoc background task orchestration have been resolved by the formal extraction of `@hardkas/jobs`.

## Resolution Details
- **Repeated Logic**: Lab 07 and Lab 08 independently had to implement state machines for handling Jobs alongside Fastify loops. This is now fully managed by `JobRunner` and `JobStoreJson` from `@hardkas/jobs`.
- **Progress Tracking**: UI components in Lab 08 required a deterministic way to read job progress. The `ProgressReporter` and the standard `JobRecord` returned by `JobRunner.getJob()` standardize this response for any HardKAS application.
- **Resiliency**: The extraction of `JobCheckpoint` and `RetryPolicy` ensures that Batch engines (like Lab 07) or Reconciliators (like Lab 08) do not lose work during transient failures or application restarts.

With this extraction, the SDK natively supports building heavy, iterative, long-running Kaspa tasks without relying on external queuing infrastructure, staying true to the local-first philosophy of HardKAS.
