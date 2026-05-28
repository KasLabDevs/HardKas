# Unified Send Workflow

HardKAS provides a unified, deterministic transaction send workflow across all layers: the CLI, the TypeScript SDK, and the Dev-Server.

All layers return the canonical send envelope:

```typescript
{
  ok: true,
  data: {
    plan: TxPlanArtifact,
    signed: SignedTxArtifact,
    receipt: TxReceiptArtifact,
    artifacts: BaseArtifact[], // Array containing all 3 artifacts
    warnings: string[],
    explanation: {
      available: boolean,
      artifactId?: string
    }
  },
  meta: {
    network: string,
    workspace: string,
    mode: string
  }
}
```

## The Simple Path

Use the simple path when you want HardKAS to automatically manage planning, signing, and broadcasting.

### SDK
```typescript
const res = await client.tx.send({
  from: "kaspa:...",
  to: "kaspa:...",
  amountSompi: "100000000",
  allowDevAutoSign: true
});
```

### CLI
```bash
hardkas tx send --from alice --to bob --amount 1 --json
```

> [!WARNING]
> Dev-server auto-signing via the simple path requires `allowDevAutoSign: true` and is strictly prohibited on Mainnet.

## The Advanced Path

Use the advanced path to build modular transactions. This is required for Mainnet or multi-sig scenarios where planning, signing, and sending happen asynchronously across different agents or devices.

### Step 1: Plan
```bash
hardkas tx plan --from alice --to bob --amount 1 --out plan.json
```

### Step 2: Sign
```bash
hardkas tx sign plan.json --account alice --out signed.json
```

### Step 3: Send
```bash
hardkas tx send signed.json --json
```

### SDK Equivalent
```typescript
const planRes = await client.tx.plan({ from, to, amountSompi });
const signRes = await client.tx.sign({ planId: planRes.data.artifactId, account: from });
const sendRes = await client.tx.send({ signedTxId: signRes.data.artifactId });
```

> [!TIP]
> Both the simple path and advanced path emit identical artifacts to the filesystem for reproducible determinism.
