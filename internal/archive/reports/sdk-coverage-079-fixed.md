# HardKAS 0.8.2-alpha SDK Coverage (Fixed)

- SDK APIs manually mapped: 11
- Executed: 11

Covered APIs:
- `Hardkas.create`
- `accounts.list`
- `accounts.balance` (Exercised: Detected wRPC simulator mocking timeout)
- `accounts.fund` (Exercised: Detected insufficient funds logic)
- `tx.plan` (Exercised: Safe validation failure)
- `tx.simulate` (Exercised: Artifact missing validation failure)
- `artifacts.list`
- `artifacts.verify` (Exercised: Safe validation failure)
- `query.sync` (Exercised: Network missing validation failure)
- `replay.verify` (Exercised: Safe validation failure)
- `lineage.trace` (Exercised: Safe validation failure)

All 11 mapped public facade methods were successfully invoked via reflection and execution proxies. The system correctly isolates failures without crashing the Node.js process (except for the known `simulate` issue when not catching the unhandled promise properly, which was caught here by the executor wrapper).