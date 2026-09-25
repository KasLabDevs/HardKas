# Offline Signing & Finalization

Once a PSKT is created, it can be transferred to an offline environment for signing.

## 1. Sign the PSKT

On the offline machine (or using an external signer), provide the PSKT and the required key material.

```bash
hardkas pskt sign session.json --account alice_real --out signed_session.json
```

**What happens here?**
* HardKAS decrypts `alice_real` to get the Private Key.
* It passes the binary PSKT and the key to the upstream Kaspa native signer.
* The native signer evaluates which inputs match Alice's key and attaches **Partial Signatures**.
* The mutated PSKT is saved to `signed_session.json`. 

*Note: The transaction is still a PSKT. It has not been extracted.*

## 2. Finalize

Once all required signatures are gathered (for a single-signer workflow, this is just Alice's signature), the PSKT must be Finalized.

```bash
hardkas pskt finalize signed_session.json --out final_session.json
```

The upstream Finalizer evaluates the Kaspa spending scripts for every input. If the partial signatures satisfy the scripts, the PSKT state is marked as Complete.

## 3. Extract

A Finalized PSKT cannot be broadcast directly. It must be Extracted into a standard Kaspa network transaction.

```bash
hardkas pskt extract final_session.json --network simnet --out tx.json
```

The Extractor strips the PSKT metadata and produces a raw serialized transaction. 
*Failure Condition:* If you attempt to extract a PSKT that has not been successfully finalized, the upstream extractor will fail.

## 4. Submit

The extracted transaction can now be broadcast by any online node.

```bash
hardkas tx send tx.json --out receipt.json
```
