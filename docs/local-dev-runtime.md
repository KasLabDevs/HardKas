# Local Developer Runtime

The HardKAS local developer runtime is orchestrated via the `hardkas dev` command namespace.

## Dev-Server as a Projection

When you run `hardkas dev server`, it boots up an API layer, a dashboard UI, and an in-memory SQLite database.

**Crucially, this dev-server is just a projection.**

- It does not own your data.
- The SQLite database can be deleted at any time and fully rebuilt.
- The dev-server and dashboard are simply disposable facades over your immutable artifact graph.

## Doctor

`hardkas dev doctor` helps maintain your local environment by verifying:

- Node.js compatibility (`>= 22.5.0`)
- Artifact and Append integrity
- The absence of node-specific polyfills bleeding into browser bundles
- Localnet and RPC capabilities
