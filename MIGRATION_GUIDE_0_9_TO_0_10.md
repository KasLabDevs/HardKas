# MIGRATION GUIDE: 0.9.x to 0.10.x

## Key Changes
1. **Strict Evidence**: Tests must now be run with `hardkas test --evidence` to properly produce verifiable `.hke.json` packages.
2. **Keystore Security**: Plaintext keys are no longer permitted. Update your tests to use the newly enforced `keystoreRef` encryption.
3. **Template Scaffolding**: Use `hardkas create <template>` to get the latest 0.10.x V1 Plugin standard.

## Breaking Changes
- **Dynamic Boundaries**: Removed from Query Store. If you relied on them, migrate to the statically typed bounds.
