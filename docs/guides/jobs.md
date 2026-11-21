# Chapter 06: Jobs

Real applications require asynchronous background tasks. `@hardkas/toolkit` manages them reliably: the job queue that was the separate `@hardkas/jobs` package is now part of it (`JobRunner`, `JobStoreJson` and `JobsToolkit` are all exported by `@hardkas/toolkit`).

## Concepts
- **JobRunner**: Orchestrates jobs.
- **JobStoreJson**: Persists job state locally.
- **JobsToolkit**: Facade for interacting with jobs.

```typescript
import { JobsToolkit } from '@hardkas/toolkit';

const jobs = JobsToolkit.open({ storePath: '.hardkas/jobs.json' });
jobs.registerHandler('reconcile', async (ctx) => {
    ctx.progress.update({ total: 100, processed: 50 });
});
```
