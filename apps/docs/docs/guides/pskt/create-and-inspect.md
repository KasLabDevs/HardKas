# Creating & Inspecting PSKTs

:::warning Unavailable in this build
No PSKT adapter implements an operation in this build, so the workflow below does not run: `hardkas pskt export` refuses with a typed error. `HARDKAS_EXPERIMENTAL=1` only silences the warning the `pskt` commands print; it enables nothing. See [PSKT](../../concepts/pskt/index.md).
:::

This guide describes the workflow a PSKT adapter would run.

## 1. Exporting a Plan

Normally, `hardkas tx plan` generates a `TxPlanArtifact`. To convert this intent into a distributable PSKT, use `export`:

```bash
hardkas tx plan --from alice --to bob --amount 10 --out plan.json
hardkas pskt export --plan plan.json --out session.json
```

With an adapter, this would create a `PortableSigningSession` artifact carrying the base64-encoded binary PSKT payload.

## 2. Inspecting the Session

Before a Signer attaches their private key, they must independently verify the contents of the PSKT, with a tool that decodes the payload.

```bash
hardkas pskt inspect session.json
```

`hardkas pskt inspect` is **not** that tool. It shows the session file's metadata only: session id, plan id, network, state, revision, runtime binding, participants and the payload hash. It does not decode the payload, so it shows no inputs, outputs, amounts, recipients or signature state.

*Security Rule:* Verify the outputs with a tool that decodes the payload. If they do not match the expected intent, reject the PSKT.
