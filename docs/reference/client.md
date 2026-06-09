# Client Reference

`@hardkas/client` is the browser-safe HTTP client for the HardKas dev server. It does not contain the Node.js SDK, filesystem access, SQLite, or signing runtime.

## Create A Client

```typescript
import { createClient } from "@hardkas/client";

const client = createClient({
  baseUrl: "http://127.0.0.1:7420",
  timeout: 5000
});
```

## Calls

```typescript
const wallet = await client.getWallet("alice");
const plan = await client.txPlan({
  from: "alice",
  to: "bob",
  amount: "1",
  network: "simulated"
});
```

Responses use the same shape:

```typescript
type HardKASResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; details?: unknown };
```

## React

React hooks and `HardKASProvider` live in `@hardkas/react`, which wraps `@hardkas/client`.
