# Security Model

## WASM Boundary Serialization Rules
The Kaspa WebAssembly module generates a `PrivateKey` object internally. This object contains a `__wbg_ptr` referencing process-local memory. 
**HardKAS strictly forbids returning this object across execution boundaries.** 
Keys are serialized into hex strings, validated, pushed into WASM for the duration of the `sign` operation, and then immediately discarded.

## Tamper Resistance
HardKAS does not rely on the OS to protect files. It relies on cryptographic hashing. The `artifact verify` command independently calculates the hash of the JSON contents and asserts it matches the signature payload.

> [!IMPORTANT]
> HardKAS does not replace Kaspa consensus. HardKAS protects the *client execution environment*. A perfectly signed HardKAS transaction can still be rejected by a Kaspa node if the inputs were already spent.
