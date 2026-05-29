# HardKAS sandboxed Workflow Orchestration

Workflows allow developers to programmatically schedule multiple sequential steps under strict safety boundaries (Sandboxing).

---

## 1. Declarative Workflow Syntax

Workflows are specified in standard JSON format (`hardkas.workflow.v1` schema):

```json
{
  "workflowId": "workflow-transfer-demo",
  "policy": {
    "allowNetwork": false,
    "allowMainnet": false,
    "allowExternalWallet": false,
    "requireDryRun": true
  },
  "steps": [
    {
      "type": "tx.send",
      "from": "alice",
      "to": "bob",
      "amount": "10"
    }
  ]
}
```

---

## 2. Sandbox Policy Reference

- `allowNetwork`: Set to `false` to block external HTTP/RPC requests. Ensures E2E testing runs 100% offline.
- `allowMainnet`: Set to `false` to prevent planning transactions targeting Kaspa mainnet addresses.
- `allowExternalWallet`: Set to `false` to block credentials/external signing interfaces.
- `requireDryRun`: Set to `true` to force dry-run mutations and prevent real broadcasting.

---

## 3. Running Workflows

Execute a declarative workflow using the CLI:

```bash
# Execute workflow
hardkas workflow run ./workflows/transfer-demo.json
```

The workflow engine writes a `hardkas.workflow.v1` artifact, sealing the causal history of the steps and policy proof.

---

## 4. Replaying & Diffing

Verify the causal outputs or audit execution drift:

```bash
# Replay workflow lineage
hardkas workflow replay ./workflows/workflow-transfer-demo.json

# Diff two workflow runs
hardkas workflow diff run-a.json run-b.json
```
