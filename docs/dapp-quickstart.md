# HardKAS dApp Quickstart

HardKAS provides a rich local developer experience (DX) for building Kaspa decentralized applications (dApps) through the `hardkas dev` subsystem.

## 1. Create a dApp

Run the scaffolding command to generate a React dApp template pre-configured for HardKAS:

```bash
hardkas dev create my-dapp
cd my-dapp
```

## 2. Start the Dev Server

Start the local `hardkas dev` environment. This runs:
- A local simulated Kaspa network (localnet)
- The HardKAS Dev-Server API on `http://127.0.0.1:7420`
- The deterministic file-system artifact watcher

```bash
hardkas dev
```

## 3. Connect to the SDK

In your React application, initialize the HardKAS browser-safe SDK client:

```typescript
import { createHardkasClient } from "@hardkas/sdk/client";

export const client = createHardkasClient({
  baseUrl: "http://localhost:7420",
  network: "simulated"
});
```

## 4. Send a Transaction

You can orchestrate an end-to-end transaction using the canonical `workflow.transfer` or `tx.send` endpoints. Since you are in local dev mode, you can utilize Dev-Server auto-signing:

```typescript
const res = await client.workflow.transfer({
  from: "kaspa:sim_alice",
  to: "kaspa:sim_bob",
  amountSompi: "100000000",
  allowDevAutoSign: true
});

if (res.ok) {
  console.log(`Transaction sent! Receipt ID: ${res.data.receipt.txId}`);
}
```

> [!NOTE]
> `workflow.transfer` delegates strictly to `tx.send`. Both return identical unified payload structures.

## 5. Observe Artifacts

Instead of polling REST endpoints for state, HardKAS emphasizes deterministic causality. Every transaction yields a verifiable artifact. 

Listen to real-time artifact generation using SSE:

```typescript
useEffect(() => {
  const unsubscribe = client.artifacts.watch((artifact) => {
    console.log("New artifact emitted:", artifact);
  });
  
  return () => unsubscribe();
}, []);
```
