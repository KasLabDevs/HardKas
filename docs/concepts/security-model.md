# Security Model

## WASM Boundary Serialization Rules
The Kaspa WebAssembly module generates a `PrivateKey` object internally. This object contains a `__wbg_ptr` referencing process-local memory. 
**HardKAS strictly forbids returning this object across execution boundaries.** 
Keys are serialized into hex strings, validated, pushed into WASM for the duration of the `sign` operation, and then immediately discarded.

## Tamper Resistance
HardKAS does not rely on the OS to protect files. It relies on cryptographic hashing. The `artifact verify` command independently calculates the hash of the JSON contents and asserts it matches the signature payload.

> [!IMPORTANT]
> HardKAS does not replace Kaspa consensus. HardKAS protects the *client execution environment*. A perfectly signed HardKAS transaction can still be rejected by a Kaspa node if the inputs were already spent.

## Stored Evidence Is Write-Once
An artifact is stored under its identity (its content hash) once:
- Writing the same identity again keeps the stored copy byte for byte, and that stored copy is what the command returns or prints. Its `createdAt` and other fields outside the identity stay those of the first write.
- If the stored copy no longer verifies as that identity (it was edited), is not that identity, or is not JSON, the write fails with `ARTIFACT_IDENTITY_CONFLICT` and the file is left exactly as it is. A second write never repairs edited evidence, so the edit stays visible to `hardkas verify`.

## Credentials in URLs
An RPC URL may carry a credential. HardKAS records and shows it without the credential:
- the userinfo (`user:password@`) is removed;
- the value of every query parameter named as a secret is replaced by `REDACTED`. The names are compared without case, and `_` and `-` are ignored: `token`, `accessToken`, `authToken`, `apiKey`, `key`, `auth`, `access_token`, `api_key`, `sig`, `signature`, `password`, `passphrase`, `secret`, `secretKey`, plus the structured secret field names such as `privateKey` and `mnemonic`;
- the scheme, host, port, path and the other query parameters are kept as they are.

This applies to what is written into evidence and state (`txSubmission.rpcUrl` and its recorded submit error, `txPlan.rpcUrl`, `txObservation.rpcUrl`, the fork source in `localnet.json`) and to everything the CLI prints, including error messages and the dev server's access log. Lock files record the command, never its arguments.

> [!NOTE]
> A credential embedded in an opaque path segment (for example `https://provider.example/v3/<key>`) cannot be identified generically without knowing the provider, and is kept as it is.

Evidence written before this rule is never rewritten. Inspection, listing and configuration commands (`kaspa wallet list --json`, `config show --json`) do not reveal secrets; only commands whose explicit purpose is to reveal or export a key do, and only on an explicit flag (for example `kaspa wallet create --show-private-key`, `dev accounts reveal`). `kaspa wallet create` stores nothing, so without `--show-private-key` it refuses before generating a key, and points to `accounts real generate --password-env` for a stored, encrypted account.
