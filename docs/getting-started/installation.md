# Installation

HardKAS is distributed via NPM. It requires **Node.js v24.15.0 or later**.

## Core Packages

```bash
npm install @hardkas/cli -g
npm install @hardkas/sdk
npm install @hardkas/client
```

- **@hardkas/cli**: The command-line orchestrator for interacting with the local environment and network.
- **@hardkas/sdk**: The isomorphic Javascript API for programmatic transaction planning and signing.
- **@hardkas/client**: The React/Vite integration layer providing `HardkasProvider` and UI hooks.

> [!NOTE]
> HardKAS uses WASM natively. Vite and other modern bundlers support this out of the box, but you must ensure your build system does not strip `.wasm` assets.
