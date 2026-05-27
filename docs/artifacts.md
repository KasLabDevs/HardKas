# Artifacts: The Canonical Source of Truth

HardKAS avoids storing critical runtime state in opaque SQLite databases. Instead, SQLite is strictly a **projection** layer.

The true, canonical state of your environment lives in `.hardkas/artifacts/`.

## Append-Only Ledger
All artifacts (`tx-plan`, `signed-tx`, `receipt`, `workflow`) are appended immutably to an event ledger (`events.jsonl`). 

## Lineage
Artifacts construct a DAG (Directed Acyclic Graph) via `parentArtifacts` or `parents` fields. This backward-only reference model prevents mutation of past artifacts while allowing rich graph traversal for explainability and time-travel.
