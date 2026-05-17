# @hardkas/react

React hooks and provider context for integrating with the HardKAS deterministic local developer runtime.

## ⚠️ Alpha-Only Local-Runtime Coupling Warning

Please note that in the `v0.4.0-alpha` release, this package has direct dependencies on the **`@hardkas/bridge-local`** package to facilitate local bridge payload planning and prefix-mining simulations directly within hooks like `useBridgeLocalPlan` and `useBridgeLocalSimulation`.

### 🛡️ Production & Browser Safety

- **Local Developer Context Only**: The current coupling is designed strictly for local developer preview, ZK/bridge research, and sandbox cockpit operations.
- **Not Safe for Production Web Browsers**: Do not use the bridge simulation hooks in a public-facing production environment, as they contain node/local-first filesystem assumptions and heavy CPU simulation logic.
- **Future Separation Roadmap**: We plan to decouple this local simulation code from `@hardkas/react` into a dedicated local testing library (`@hardkas/react-local`) in a post-alpha release.
