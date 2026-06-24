# HardKAS Current State: Local-First Developer Infrastructure

**Veredicto:**

HardKAS is not production-ready and does not aim to be yet.
HardKAS is a local-first SDK/CLI/runtime/evidence stack.
Current status: DEGRADED_PASS.

## Clasificación clara:

### CORE STRONG
- `@hardkas/core`
- `@hardkas/artifacts`
- `@hardkas/simulator`
- `@hardkas/query-store`
- `@hardkas/testing`

### LOCAL RUNTIME GOOD, NEEDS DX FIX
- `@hardkas/localnet`
- `@hardkas/accounts`
- `@hardkas/tx-builder`
- `@hardkas/kaspa-rpc`

### DX POWERFUL BUT UNEVEN
- `@hardkas/cli`
- `@hardkas/sdk`
- `@hardkas/dev-server`

### APP/DASHBOARD SUPPORT
- `@hardkas/client`
- `@hardkas/react`
- `@hardkas/wallet-adapter`
- `@hardkas/sessions`

### PROGRAMMABILITY EXTENSIONS
- `@hardkas/l2`
- `@hardkas/bridge-local`
- ZK
- vProgs
- SilverScript
- stable asset simulation

## Roadmap Inmediato (P1)

1. ~~`localnet fund alice --json`~~ *(Completado)*
2. ~~`silver doctor --json`~~ *(Completado)*
3. Uniform JSON for auditable CLI commands
4. Explicit mode labels:
   - `SIMULATED`
   - `LOCAL_DOCKER`
   - `EXPERIMENTAL`
   - `NOT_CLAIMED`
