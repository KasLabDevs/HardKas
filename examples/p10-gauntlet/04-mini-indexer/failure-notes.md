# Predicted Friction Points

- `sdk.query.store.sql` might expose internal implementation details (e.g., table names) that aren't documented.
- Does `sdk.query.store.sql` sanitize inputs or is it prone to SQL injection/bad syntax crashes?
- `sdk.artifacts.list()` might return too much data if not paginated, or might not return the full artifact body (requiring `read()`).

## Actual Friction Encounters

1. **Bug**: `Cannot read properties of undefined (reading 'sql')`.
   - **Context**: The `HardkasQuery` SDK facade (`sdk.query`) does not expose a `.store` property, even though the CLI has `hardkas query store sql`. To use SQL, developers must import `@hardkas/query-store` directly, which breaks the SDK facade pattern.

2. **Bug**: `The "paths[1]" argument must be of type string. Received undefined`.
   - **Context**: `sdk.artifacts.list()` returns an array of FULL parsed artifact objects, not summary metadata. Thus `artifact.id` is undefined (artifacts use `contentHash`, `planId`, etc.). When passing `undefined` to `sdk.artifacts.read()`, it throws an obscure `path.join` TypeError rather than a helpful validation error "Artifact ID must be a string".
