# Local-First Transaction Workflow

HardKAS operates on a strict **local-first, deterministic-first** philosophy. This means that execution always flows from the file system outward.

## Architecture

1. **Artifacts are Canonical:**
   The Dev-Server and SQLite databases are merely projections of the immutable `.json` artifacts stored in `.hardkas/artifacts/`.
2. **Localnet != Mainnet:**
   Transactions executed on `simulated` networks execute deterministically in a local runner. A localnet `tx.send` execution does **not** imply finality on Kaspa Mainnet.
3. **No EVM:**
   Kaspa L1 does not execute EVM. Smart contracts, Covenants, Tockata, and SilverScripts are either L2 overlays or future protocol capabilities. HardKAS tracks these via read-only metadata fields.

## Script/Covenant Readiness

To prepare for future protocol upgrades (e.g., Tockata, SilverScripts) without making false claims about the current runtime, HardKAS embeds **Script Readiness Metadata** into the `BaseArtifactSchema`.

```typescript
scriptProfile?: "standard" | "experimental";
scriptCapabilities?: ScriptCapability[];
scriptMetadata?: {
  language?: "native" | "silverscript" | "tockata";
  version?: string;
  experimental: boolean;
  notes?: string[];
  consensusImpact?: "none" | "experimental";
};
```

> [!IMPORTANT]
> These fields are **metadata only**.
> Do not interpret `scriptCapabilities` as execution guarantees unless running an experimental Kaspa Node fork that supports them. The metadata explicitly includes `consensusImpact` to warn consumers.

## The Local Dev Loop

1. **Plan:** Construct `TxPlanArtifact` representing the semantic intent.
2. **Sign:** Authorize the plan to produce a `SignedTxArtifact`.
3. **Send (Simulated):** The `localnet` runner executes the signed artifact, modifies local state, and emits a `TxReceiptArtifact` and `TxTraceArtifact`.
4. **Send (Real):** The payload is broadcast to Kaspa L1, yielding a `TxReceiptArtifact` (status: `submitted`). Finality is observed externally.

Because the artifacts are identical in both flows, HardKAS provides the ultimate staging environment for Kaspa dApps.
