# Script Readiness

HardKAS is heavily focused on L1 native operations. However, experimental readiness indicators exist for more advanced smart contracting.

## Tockata and SilverScript

Artifacts can hold a `scriptMetadata` or `ScriptCapability` payload. Currently, these payloads are entirely **read-only/observational**.

They denote the _intent_ of a transaction (e.g., this payload complies with Tockata standards). However, HardKAS **does not** execute SilverScript or Tockata contracts on-chain. There is no active covenant runtime.

These fields are strictly for developer visibility and testing scaffolding.
