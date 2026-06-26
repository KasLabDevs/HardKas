# PUBLIC API SURFACE (0.10.x FREEZE)

The following APIs and commands are officially FROZEN and stable for the 0.10.x lifecycle. Breaking changes to these will require a major version bump.

## SDK & Runtime
- `hk` (Global HardKAS object)
- `scenario()` (Testing engine primitive)
- Artifact schema and registry APIs (`@hardkas/artifacts`)
- Tx building and lifecycles (`@hardkas/tx-builder`, `tx` commands)
- Accounts and Keystore APIs (`@hardkas/accounts`)
- Localnet and Query integrations (`@hardkas/localnet`, `@hardkas/query`)
- Plugin Interface V1 (Core lifecycle hooks and task definitions)

## CLI Commands
- `hardkas init`
- `hardkas create`
- `hardkas test`
- `hardkas evidence`
- `hardkas task`
