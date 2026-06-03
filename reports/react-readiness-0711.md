# HardKAS 0.8.2-alpha — React/App Readiness Probe

## react-wallet-readonly
**Classification:** NODE_ONLY_BOUNDARY
**Blocked By Node Modules:** fs, path, crypto
**Build Error snippet:**
```

> build
> vite build

[36mvite v5.4.21 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 24 modules transformed.

[1m[33m[plugin:vite:resolve][39m[22m [33m[plugin vite:resolve] Module "fs" has been externalized for browser compatibility, imported by "C:/Users/jrodr/Documents/kaslabdevs/GitHub/react-readiness-probes/react-wallet-readonly/node_modules/@hardkas/sdk/dist/index.js". See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibilit
```

## react-artifact-viewer
**Classification:** NODE_ONLY_BOUNDARY
**Blocked By Node Modules:** fs, path, crypto
**Build Error snippet:**
```

> build
> vite build

[36mvite v5.4.21 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 28 modules transformed.

[1m[33m[plugin:vite:resolve][39m[22m [33m[plugin vite:resolve] Module "fs" has been externalized for browser compatibility, imported by "C:/Users/jrodr/Documents/kaslabdevs/GitHub/react-readiness-probes/react-artifact-viewer/node_modules/@hardkas/sdk/dist/index.js". See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibilit
```

## react-transaction-form
**Classification:** NODE_ONLY_BOUNDARY
**Blocked By Node Modules:** fs, path, crypto
**Build Error snippet:**
```

> build
> vite build

[36mvite v5.4.21 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 29 modules transformed.

[1m[33m[plugin:vite:resolve][39m[22m [33m[plugin vite:resolve] Module "fs" has been externalized for browser compatibility, imported by "C:/Users/jrodr/Documents/kaslabdevs/GitHub/react-readiness-probes/react-transaction-form/node_modules/@hardkas/sdk/dist/index.js". See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibili
```

## react-backend-proxy
**Classification:** BACKEND_PROXY_WORKS

## Recommended Architecture Diagram
```mermaid
graph TD;
  Browser[Browser React App] -->|HTTP| Hooks[@hardkas/react Hooks]
  Hooks --> Client[@hardkas/client HTTP]
  Client -->|REST/RPC| Backend[Node.js Backend/Proxy]
  Backend --> SDK[@hardkas/sdk]
  SDK --> Workspace[.hardkas/]
```

