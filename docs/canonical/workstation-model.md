# HardKAS Workstation Security Model

This document specifies the security controls deployed to isolate the developer's local filesystem and workspace state from untrusted web browser actions.

---

## 1. Localhost CSRF Isolation

To prevent malicious third-party websites open in a background browser tab from executing silent AJAX requests against `localhost:7420`, the dev-server deploys strict Cross-Origin Resource Sharing (CORS) limits:
* **No Wildcards**: CORS wildcard `*` headers are forbidden on all mutation paths.
* **Token Authentication**: Every POST/PUT/DELETE request must present a valid `Authorization: Bearer <token>` header containing the pre-shared workstation token (`HARDKAS_DEV_TOKEN`).
* **Handshake requirement**: The SSE channel enforces a token handshake at connection initialization.

---

## 2. DNS Rebinding Protections

DNS Rebinding allows a malicious external domain to resolve to `127.0.0.1` and bypass same-origin policies to steal authentication tokens. HardKAS mitigates this threat:
* **Host Header Verification**: Dev-server middleware parses and whitelists incoming `Host` headers.
* **Explicit Drops**: Any request targeting domain names other than explicit loopback boundaries (`localhost`, `127.0.0.1`, `[::1]`) is dropped immediately.

---

## 3. Sandboxed Path Containment

The SDK's filesystem driver (`HardkasArtifactsManager`) enforces path containment:
* **Traversal Checks**: Path inputs are validated using relative resolution checks to ensure they do not traverse outside the initialized `workspaceRoot`.
* **Process Isolation**: Spawning virtual localnet nodes uses absolute paths, bypassing command shells (`cmd.exe`, `sh`) to prevent terminal injection vulnerabilities.
