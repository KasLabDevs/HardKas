# HardKas Dev Server (Local)

The HardKas Dev Server is a local-only development runtime that bridges your workspace state with browser-based tools and dashboards. It provides real-time visibility into your local Kaspa and Igra environments.

## Architecture

The server acts as a central hub for development data:

```text
Browser/UI  <-- (REST / SSE) -->  HardKas Dev Server
                                         |
                                         +-- Sessions (.hardkas/sessions.json)
                                         +-- Kaspa RPC (Local Node)
                                         +-- Igra RPC (Local Node)
```

## Getting Started

Start the server from your project root:

```bash
hardkas dev server
```

By default, the server runs on `http://localhost:7420`.

### Flags

- `--port <number>`: Change the default port.
- `--host <string>`: Change the bind address.
- `--unsafe-external`: Allow access from outside localhost (e.g., for mobile testing). **Warning: Use only in trusted local networks.**
- `--json`: Output server status as JSON.

## API Reference

### 👤 Sessions
- `GET /api/session`: Get metadata for the currently active session.
- `GET /api/session/list`: List all available sessions in the workspace.

### 🩺 Health
- `GET /api/health`: Check the health of local Kaspa and Igra RPC nodes.

### 🌉 Bridge
- `POST /api/bridge/simulate`: Perform a deterministic bridge-entry simulation.
  - **Body**: `{ "payload": "hex...", "prefix": "abc" }`
  - **Returns**: Simulation results (nonce, hash, attempts).

### 📡 Real-time Stream (SSE)
- `GET /api/stream`: A Server-Sent Events stream for live updates.
  - **Events**: `heartbeat`, `session-changed`, `session-created`, `session-deleted`, `health-changed`.
  - **Reconnection**: Clients (via `@hardkas/react`) implement exponential backoff (500ms cap to 10s) to handle server restarts or network interruptions.

## Security & Privacy

- **Local-Only**: Bound to `localhost` by default.
- **Zero Secrets**: The server never reads or transmits private keys, mnemonics, or sensitive keystore data.
- **Ephemeral**: No persistent database; state is reconstructed from the workspace and RPC polling.
- **Dev-Only**: Strictly for local/simnet development.

## Session Store Integrity

The dev server and related tools validate `.hardkas/sessions.json` on load:
- **Schema Validation**: Ensures `hardkas.session.v1` compatibility.
- **Structural Integrity**: Checks for required L1/L2 and bridge configuration.
- **Corruption Handling**: Malformed files are reported via diagnostics and not automatically overwritten, preserving user data for manual recovery.

## Integration with React

Use the `HardKasProvider` from `@hardkas/react` to automatically manage the shared SSE connection:

```tsx
<HardKasProvider config={{ ... }}>
  <MyComponent />
</HardKasProvider>
```

The provider manages a single `EventSource` connection for the entire application, handles reconnection with backoff, and cleans up resources on unmount.
