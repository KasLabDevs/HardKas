# Chapter 06: Jobs

Real applications require asynchronous background tasks. HardKAS provides `@hardkas/jobs` to manage this reliably.

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
