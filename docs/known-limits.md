# Known Limits

HardKAS is a rapidly evolving developer environment. To maintain transparency and secure engineering practices, we explicitly state the current limitations of the platform.

### Localnet ≠ Mainnet Finality
The `simulated` environment and `localnet` provide a fast, local approximation of Kaspa. They do **not** simulate true PoW finality, block times, or network congestion. Never assume a transaction that passes instantly locally will behave exactly the same under mainnet load.

### Replay Coverage
Replay capabilities currently simulate execution determinism based on available inputs. However, **replay coverage is partial**. Complex workflows, highly asynchronous scripts, or un-mocked external dependencies may lead to false divergences. Unsupported artifact types will return a strict `unsupported` status instead of faking a replay.

### No Covenant Runtime (Yet)
HardKAS does **not** currently implement a live, on-chain Kaspa Covenant runtime. Any policy checks or metadata you see are strictly client-side static verifications or dev-server mocks.

### No SilverScript Execution
`scriptMetadata` identifying `SilverScript` or `Tockata` readiness is currently **read-only/observational**. It denotes intent and structure but does not execute these scripts against an emulator or L1 consensus engine.

### No Trustless Exits
Igra L2 support is experimental. There are absolutely **no trustless exits** available. Any exit mechanism presented is a simulated convenience and does not rely on verified ZK proofs on L1. Do not use for real assets.

### Browser Client
The `@hardkas/sdk/client` is an observational facade designed to communicate with the HardKAS Dev-Server via HTTP and SSE. It does **not** run the full HardKAS engine in the browser.
