# @hardkas/react

Zero-dependency React hooks for HardKAS.

> [!WARNING]
> **DO NOT import `@hardkas/sdk` in the browser!**
> The main SDK package contains Node.js specific libraries. Use `@hardkas/react` for your web UI.

## Installation

```bash
npm install @hardkas/react @hardkas/client
```

## Setup Provider

Wrap your application in the `HardKASProvider`. This initializes the underlying `@hardkas/client` instance.

```tsx
import { HardKASProvider } from "@hardkas/react";

function App() {
  return (
    <HardKASProvider baseUrl="http://127.0.0.1:7420" timeout={10000}>
      <MyDApp />
    </HardKASProvider>
  );
}
```

## Hooks

### `useWallet`

Fetch wallet details.

```tsx
import { useWallet } from "@hardkas/react";

function WalletView() {
  const { data, loading, error } = useWallet("alice");

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

### `useMutation`

Generic hook for executing state-changing transactions against the Dev API.

```tsx
import { useMutation } from "@hardkas/react";

function SendKas() {
  const { execute, loading } = useMutation(
    (client, vars: { to: string; amount: number }) => {
      return client.txSimulate({ ...vars });
    }
  );

  return (
    <button onClick={() => execute({ to: "bob", amount: 100 })} disabled={loading}>
      {loading ? "Sending..." : "Send to Bob"}
    </button>
  );
}
```
