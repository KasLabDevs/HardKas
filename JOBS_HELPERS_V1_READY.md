# JOBS HELPERS V1 READY

The `@hardkas/jobs` module has been successfully implemented and tested according to the criteria defined in P39 Helper Extraction Round 3.

## Implemented Primitives
- **JobRunner**: Coordinates background execution, injects job context, and transitions states.
- **JobStoreJson**: Provides a local-first JSON persistence layer for job metadata, status, progress, and checkpoints.
- **ProgressReporter**: Facilitates structured updating of total/processed items and percentages.
- **JobCheckpoint**: Manages intermediate state cursors to allow for resumptions.
- **RetryPolicy**: Encapsulates iterative backoff logic for transient failure handling.
- **BatchCursor**: A simple helper for paginating through local arrays or IDs.

## Constraints Verified
- Strictly **no** external distributed dependencies (no Redis, BullMQ, RabbitMQ).
- **Single-process** background execution inside the Node.js event loop.
- Simple API conforming exactly to the mental model requested.

## Status
- Unit tests cover all job states (`pending`, `running`, `retrying`, `completed`, `failed`).
- Context injection is successfully passed to the user's handler.
