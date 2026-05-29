# HardKAS Dashboard & Dev-Server Operations

The React-based visual dashboard provides a direct, causal projection of the workspace state.

---

## 1. Starting the Dev-Server

Launch the backgrounds services on your workstation:

```bash
# Start secure local dev-server (port 7420 by default)
hardkas dev server
```

The runtime outputs the secure token whitelists:

```txt
[Security] Secure dev-server running at http://localhost:7420
[Security] Authorization Token generated successfully:
[Security] BEARER_TOKEN: <HARDKAS_DEV_TOKEN>
```

---

## 2. Navigating the Reactive Interface

- **Causal Observability Graph**: Displays account balances, snapshot check-points, and sequential transaction lineages.
- **Workflows Page**: Audits programmatic execution steps and sandbox policy proofs.
- **Generation Updates (SSE)**: The UI leverages Server-Sent Events (SSE) to update in micro-seconds when a CLI command modifies the filesystem, ensuring a zero-latency feedback loop.
- **Stale Indicators**: If SQLite synchronization lags behind rapid file mutations, the UI shows a non-blocking warn banner: _"Projection updating — displayed data may be stale"_.
