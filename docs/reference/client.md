# Client Reference

The `@hardkas/client` package is the HTTP client for a running HardKAS dev
server. It uses `fetch` and has no dependencies. The React bindings
(`HardKASProvider` and hooks) are in `@hardkas/react`, which builds on it.

## `createClient`

```typescript
import { createClient } from "@hardkas/client";

const client = createClient({ baseUrl: "http://127.0.0.1:7420", timeout: 5000 });

const response = await client.getWallet("alice");
if (response.ok) console.log(response.data);
else console.error(response.message);
```

## `HardKASProvider` (from `@hardkas/react`)

Wrap your React application to give its hooks a `@hardkas/client` instance.

```tsx
import { HardKASProvider } from "@hardkas/react";

function App() {
  return (
    <HardKASProvider baseUrl="http://127.0.0.1:7420">
      <WalletUI />
    </HardKASProvider>
  );
}
```

> [!NOTE]
> Neither package plans, signs or builds artifacts in the browser. They call the
> dev server over HTTP, and the dev server does that work with the Node.js SDK.
> Do not import `@hardkas/sdk` in the browser.
