# Artifact Schema Reference

Every artifact shares a common header:

```json
{
  "schema": "hardkas.txPlan",
  "schemaVersion": "hardkas.artifact.v1",
  "hardkasVersion": "0.9.1-alpha",
  "hashVersion": 4,
  "createdAt": "2026-06-06T12:00:00Z"
}
```

## `txPlan` Specifics

- `networkId`: The target Kaspa network.
- `amountSompi`: The exact transfer amount.
- `from.address`: Source address.
- `to.address`: Destination address.

## `signedTx` Specifics

- `sourcePlanId`: Hash of the parent `txPlan`.
- `signedTransaction.payload`: The raw hex string to be broadcast to the node.
