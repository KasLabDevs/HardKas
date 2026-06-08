# Replay Verification

Because artifacts form a cryptographic lineage, you can reconstruct the entire transaction history without a node.

```bash
hardkas artifact lineage .hardkas/artifacts/signedTx-456.json
```

This command traverses the `parentArtifactId` pointers, verifying the hashes at every step, proving that the final signed payload legitimately originated from the original plan.
