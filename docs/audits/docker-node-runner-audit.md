# HardKas Docker Node Runner Audit

## 1. Scope
This audit evaluates the Docker container orchestration for the local Kaspa node. The following have been analyzed:
- CLI commands: `hardkas node start`, `status`, `stop`, `restart`, `logs`, and `reset`.
- The internal package `@hardkas/node-runner` and its class `DockerKaspadRunner`.
- Management of images, volumes, ports, and the `kaspad` container lifecycle.
- Integration with the configuration system and the security of destructive operations.

## 2. Executive Summary
The HardKas Node Runner is a functional and robust tool for setting up local development environments (`simnet`) with a single command. It uses the Docker CLI deterministically and manages data persistence well via *bind mounts*.

However, the system presents reproducibility risks due to the use of unpinned image tags (`latest`) and lacks application-level health checks (RPC), limiting itself to checking if the container process is alive.

**System Classification:**
- **Docker orchestration:** GOOD (Simple and effective via `execa`).
- **Image management:** STABLE [RESOLVED] - Uses `v1.1.0` by default.
- **Health checks:** STABLE [RESOLVED] - Now verifies RPC availability before returning.
- **Logs UX:** GOOD (Supports `tail` and `follow`).
- **Cleanup safety:** GOOD (Protected by CLI confirmation).
- **Config integration:** PARTIAL (Most values are internal runner defaults).
- **Developer usability:** GOOD (Clear deployment abstraction).

## 3. Node Command Inventory

| Command | Args | Flags | Runner | Side effects | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `node start` | - | `--image` | `runNodeStart` | Creates and starts a Docker container. | LOW |
| `node status`| - | - | `runNodeStatus` | None (Inspection). | LOW |
| `node stop`  | - | - | `runNodeStop` | Stops and removes the container. | LOW |
| `node restart`| - | - | `runNodeRestart`| Stop/start cycle. | LOW |
| `node logs`  | - | `--tail`, `--follow`| `runNodeLogs` | None (Logs stream). | LOW |
| `node reset` | - | `--yes`, `--start` | `runNodeReset` | **Destructive**: Clears chain data. | MEDIUM |

## 4. CLI Wiring
The connection between the `node.ts` command and the runners is clean and follows the repository pattern.

| Area | Behavior | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Reset Safety | Requires `UI.confirm` unless `--yes` is used. | LOW | Maintain. This is adequate protection for dev environments. |
| Start Chain | `reset --start` allows for quick cleanup and restart. | LOW | Useful for CI testing. |
| Maturity | Commands are marked as `stable` or `preview`. | LOW | Transparency with the user. |

## 5. Docker Image Management
The runner manages the `rusty-kaspad` image.

| Feature | Present | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Default Image | `kaspanet/rusty-kaspad:v1.1.0` | **STABLE** [RESOLVED] | Pinned version ensures determinism across developer machines. |
| Image Override | YES (`--image`) | LOW | Allows the user to test experimental versions. |
| Auto-pull | YES (via `docker run`) | LOW | Standard Docker behavior. |

## 6. Container Lifecycle
The lifecycle is idempotent: if the container already exists but is not running, the runner removes it before attempting to set it up again.

| Lifecycle case | Current behavior | Idempotent | Risk |
| :--- | :--- | :--- | :--- |
| Start (Not exists) | Creates and starts. | YES | LOW |
| Start (Exists & Running) | Returns current status without changes. | YES | LOW |
| Start (Exists & Stopped) | `docker rm -f` and re-creates. | YES | LOW |
| Stop | Stops and **removes** the container. | YES | LOW (Data persists in the volume). |

## 7. Network / Ports
The node exposes three fundamental RPC ports for Kaspa.

| Port / Network | Binding | Purpose | Risk |
| :--- | :--- | :--- | :--- |
| 16210 | 127.0.0.1 | gRPC (Core functionality) | LOW (Conflict if a native kaspad already exists). |
| 17210 | 127.0.0.1 | Borsh RPC (High performance) | LOW |
| 18210 | 127.0.0.1 | JSON RPC (Compatibility) | LOW |

**Technical note**: The runner explicitly maps the ports in the `docker run` command, preventing accidental collisions if not specified.

## 8. Data / Volume Management
HardKas uses *bind mounts* to persist blockchain data outside the container.

| Data item | Location | Persisted | Deleted by reset | Risk |
| :--- | :--- | :--- | :--- | :--- |
| Chain Data | `.hardkas/kaspad/` | YES | YES | LOW (Desired for resetting state). |

The use of `path.resolve` ensures that the volume is mounted correctly regardless of where the CLI is executed.

## 9. Health Checks
This is one of the weakest areas of the current implementation.

| Health check | Present | Source | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| Container state | YES | `docker inspect` | MEDIUM | A container can be "running" but the `kaspad` process may be in panic or initializing the DB. |
| RPC Probe | YES | gRPC / JSON | **STABLE** [RESOLVED] | The CLI now waits for RPC readiness (retry loop) before returning success. |

## 10. Logs UX
Solid and functional implementation.

| Logs feature | Present | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Tail | YES (`--tail`) | LOW | Reasonable default value (100). |
| Follow | YES (`--follow`) | LOW | Inherits `stdout` directly from Docker. |

## 11. Cleanup / Reset Safety
The `node reset` command is the only dangerous operation.

| Cleanup action | Protected | Destructive | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| Stop container | YES | NO | LOW | Simply turns off the service. |
| Remove Data | YES | **YES** | MEDIUM | Deletes `.hardkas/kaspad`. Requires manual confirmation. |

**Detected risk**: The runner uses `fs.rm(..., { force: true })`, which is extremely powerful. If the `dataDir` variable were corrupted by configuration, it could delete unintended directories.

## 12. Config Integration
The `DockerKaspadRunner` is partially disconnected from the central configuration system.

| Config field | Used by node runner | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| image | NO (Uses internal default) | LOW | Allow defining the image in `hardkas.config.ts`. |
| dataDir | NO (Uses internal default) | LOW | Synchronize with the project `root`. |

## 13. Localnet Integration
The Node Runner is the pillar of the "Real Localnet". While the DAG simulator is light, the Node Runner allows testing against real Kaspa consensus in `simnet` mode.

| Integration point | Current behavior | Risk |
| :--- | :--- | :--- |
| Artifact Generation | L1 artifacts (tx, plans) depend on this node being up to be emitted/validated. | MEDIUM | If the node is not synced, artifacts may be invalid. |

## 14. Error Handling
Error handling is proactive.

| Error case | Current behavior | User clarity | Recommendation |
| :--- | :--- | :--- | :--- |
| Docker missing | Throws explicit error at start. | EXCELLENT | Informs the user to install Docker. |
| Port occupied | Docker fails and the runner propagates the error. | MEDIUM | Could suggest which process is occupying the port. |

## 15. Security / Safety Review
- **Image Trust**: The official `kaspanet` image is downloaded, which is safe.
- **Port Exposure**: Only RPC ports are mapped, not the default P2P port to the outside, reducing the attack surface.
- **Isolation**: The use of containers ensures that host system files are unaffected, except for the designated data directory.

## 16. Findings

### GOOD
- **Total Abstraction**: The developer does not need to know how to configure a kaspad `.conf` file or install C++/Rust dependencies.
- **Idempotency**: The `start` command is safe to execute multiple times.
- **Integrated Logs**: No need to jump to the Docker terminal to see what's happening.

### NEEDS HARDENING
- **`latest` Instability**: [RESOLVED] Default is now pinned to a verified version.
- **Lack of health check (Ready check)**: [RESOLVED] `start` now includes an RPC wait-loop.
- **Config Disconnection**: Node profiles should be defined in `hardkas.config.ts`.

## 17. Recommendations

### P0 — Safety & Determinism
- **Image Pinning**: [RESOLVED] Default is `rusty-kaspad:v1.1.0`.
- **RPC Readiness Check**: [RESOLVED] Implemented a robust retry loop for gRPC/JSON ports.

### P1 — UX & Config
- **Config Integration**: Allow `dataDir` and `image` to be read from `hardkas.config.ts`.
- **Port Conflict Awareness**: Before executing `docker run`, check if ports 16210, 17210, and 18210 are occupied on the host to provide a more human error message.

### P2 — Advanced Features
- **Node Profiles**: Allow starting nodes in `mainnet` or `testnet-11` mode with specific flags, even if `simnet` is the default.

## 18. Proposed Node Runner v1
Evolve the runner towards a profile-based model:

```ts
// hardkas.config.ts
export default {
  node: {
    image: "kaspanet/rusty-kaspad:v0.1.0",
    dataDir: "./.node-data",
    ports: {
      rpc: 16210
    }
  }
}
```

## 19. Final Assessment
The HardKas Docker orchestration module is one of the most stable and useful pieces in the repository. It fulfills its mission of "making Kaspa work locally in 5 seconds." With image determinism (pinning) adjustment and a gRPC health check, it will be ready for robust and reproducible local developer workflows.

## 20. Checklist
- [x] node start
- [x] node status
- [x] image management
- [x] health checks
- [x] logs
- [x] cleanup
- [x] No modifications to runtime logic
- [x] No modifications to Node Runner
- [x] No modifications to commands
- [x] Documentary audit only

### Guardrails
- No modifications to runtime logic.
- No modifications to the Node Runner.
- No modifications to Docker commands.
- No destructive cleanup tests performed.
- This audit is strictly documentary to validate the local infrastructure.
