# HardKAS CLI: The Power User Guide

HardKAS is designed to be highly introspective. This guide covers the advanced operational commands that make debugging and system verification "feel like magic."

## 🩺 System Diagnostics

### `hardkas doctor`
The ultimate health check. Run this whenever things feel "off." It verifies:
- Node.js & OS environment.
- Config file validity.
- RPC connectivity and node synchronization.
- Artifact store integrity.
- Query store (SQLite) health.

**Premium Tip:** If `doctor` reports an empty Query Store, run `hardkas query store sync` (or `rebuild`) to restore relational awareness.

---

## 🔍 The Operational Query Store

HardKAS indexes all your artifacts and events into a high-performance SQLite database.

### `hardkas query store sync`
Synchronizes your `.hardkas/` directory (JSON artifacts + `.jsonl` event logs) into the local relational index.
- **When to use:** After running a batch of transactions or manually moving artifacts.
- **DX:** Provides sub-millisecond query performance once indexed.

### `hardkas query store rebuild`
Completely wipes and reconstructs the index from scratch. Useful if the database file is corrupted or inconsistent.

### `hardkas query store sql "<query>"`
For the ultimate power user. Run raw SQL against your operational data.
- **Example:** `hardkas query store sql "SELECT schema, COUNT(*) FROM artifacts GROUP BY schema"`
- **DX:** Auto-formats results into a clean CLI table.

---

## ⛓️ Lineage & Provenance

Every artifact in HardKAS is linked to its ancestors.

### `hardkas artifact lineage <path>`
Shows the internal provenance metadata of a specific artifact and visualizes its place in the execution chain.
- **Premium Visualization:** Shows the path from ROOT → PARENT → HERE.

---

## 🛰️ Transaction Tracing

### `hardkas tx trace <txId>`
The "star" command for operational visibility. It performs a **Cross-Domain Correlation** of:
- **Lineage:** Where did this transaction come from?
- **DAG:** Is it accepted, and where in the chain?
- **RPC:** What was the node health at the exact moment of submission?
- **Replay:** Does the recorded receipt match a clean re-execution?

**Premium Tip:** Use this command to debug "mysterious" transaction delays or rejections.

---

## 🎨 Design Philosophy: Polish & DX

- **Actionable Errors:** Every error includes a "💡 Suggestion" to get you back on track.
- **Beautiful Outputs:** We use high-contrast colors and structured boxes to make information scannable.
- **Reasoning Chains:** Queries often include an "Explain" section that shows the "Thinking" process of the engine.
