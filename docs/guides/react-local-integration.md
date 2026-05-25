# HardKas React Integration

`@hardkas/react` is a local-first React integration layer designed for developers building on Kaspa L1 and Igra L2. It provides a set of session-aware hooks that facilitate full-stack development without the complexity of production-grade wallet adapters.

## Why use @hardkas/react?

- **Session Awareness**: Automatically resolves L1 and L2 identities based on your active HardKas session.
- **Local-First**: Built-in defaults for local nodes (`kaspad` and `igrad`).
- **Standardized Hooks**: Clean, TanStack Query-powered hooks for balances, contract reads, and bridge simulations.
- **Safety**: Strictly restricted to local/dev environments by default; never reads or exposes private keys.

## Getting Started

### 1. Install Dependencies

```bash
npm install @hardkas/react @tanstack/react-query viem react react-dom
```

### 2. Configure the Provider

Wrap your application with the `HardKasProvider`.

```tsx
import { HardKasProvider } from "@hardkas/react";

function Root() {
  return (
    <HardKasProvider 
      config={{
        kaspaRpcUrl: "http://127.0.0.1:16110",
        igraRpcUrl: "http://127.0.0.1:8545",
        localOnly: true
      }}
    >
      <App />
    </HardKasProvider>
  );
}
```

### 3. Use Hooks

```tsx
import { useHardKasSession, useKaspaBalance, useIgraBalance } from "@hardkas/react";

function Dashboard() {
  const { data: session } = useHardKasSession();
  const { data: kaspaBalance } = useKaspaBalance({ refetchInterval: 5000 });
  const { data: igraBalance } = useIgraBalance({ refetchInterval: 5000 });

  if (!session) return <div>No active session. Use `hardkas session use <name>`</div>;

  return (
    <div>
      <h1>Session: {session.name}</h1>
      <p>Kaspa Balance: {kaspaBalance?.toString()} sompi</p>
      <p>Igra Balance: {igraBalance?.toString()} wei</p>
    </div>
  );
}
```

## Advanced Features

### Deterministic Cache Aiding
All query keys in `@hardkas/react` are deterministic and include:
- **Session Identity**: Data is isolated per session name.
- **RPC Identity**: Prevents collisions when switching between different local nodes.
- **Network Mode**: Isolated caches for different simulation modes.

### SSR & Next.js Compatibility
The library is safe for Server-Side Rendering. It avoids direct browser API access (`window`, `localStorage`) in its hooks, making it ideal for Next.js (App Router or Pages Router) and other modern frameworks.
```

## Limitations

- **No Browser Wallet**: This PR does not include a wallet adapter for MetaMask or KasWare. It uses local session metadata for addresses.
- **Read-Only Secrets**: The React layer cannot read private keys from your keystore. Signing must be handled via explicit wallet clients or future adapters.
- **Local Enforced**: By default, it will fail if connected to a network that is not identified as local/simnet.

## Future Roadmap

- **PR 26+**: Browser Wallet Adapter (MetaMask/KasWare integration).
- **HardKAS Dev Server**: A local sidecar process to expose workspace sessions and artifacts to the browser safely.
