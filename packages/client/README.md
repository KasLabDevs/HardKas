# @hardkas/client

The official HTTP client for the HardKAS Dev Server.

**Not published in this release.** `@hardkas/client` is a private workspace package: no published HardKAS package depends on it, so this release puts no version of it on npm and the install command below does not fetch this version. Inside the HardKAS monorepo it stays a workspace package. See [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md#not-published) ("Not published").

> [!WARNING]
> **DO NOT import `@hardkas/sdk` in the browser!**
> The main `@hardkas/sdk` package contains Node.js-specific native dependencies (like `fs`, `crypto`, and `better-sqlite3`) and will crash your web application.
>
> Always use `@hardkas/client` (or framework wrappers like `@hardkas/react`) to communicate with the HardKAS Dev Server.

## Features

- **Zero Dependencies**: Uses native `fetch` API.
- **Framework Agnostic**: Works with React, Vue, Angular, Svelte, or Vanilla JS.
- **Type-Safe**: Full TypeScript support with standardized `{ ok: true, data }` responses.

## Installation

```bash
npm install @hardkas/client
```

## Usage

```typescript
import { createClient } from "@hardkas/client";

const client = createClient({
  baseUrl: "http://127.0.0.1:7420",
  timeout: 5000
});

async function run() {
  const response = await client.getWallet("alice");
  if (response.ok) {
    console.log("Wallet data:", response.data);
  } else {
    console.error("Error:", response.message);
  }
}
```

> [!NOTE]
> The Dev Server blocks mainnet transaction signing by default to protect your keys. It is intended for `simulated` local development.
