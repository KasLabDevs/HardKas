# SilverScript reference contracts

Contracts that show what the v1 engine (`sdk.covenants`) does from the CLI. Each one runs on the canonical localnet
(`hardkas localnet start --toccata`). These are simnet runs: nothing here is a TN10 or mainnet result.

| Contract | Source | What it shows |
| --- | --- | --- |
| OwnedCounter | [`contracts/owned-counter.sil`](contracts/owned-counter.sil) | A covenant transition the owner must sign. A wrong signer is refused before anything is signed; the policy (`require(delta > 0)`) is the node's to enforce; the lineage is verifiable. |
| Counter | [`current.sil`](../../fixtures/toccata-v2/silver/covenant-counter-transition/current.sil) | 1:1 auth-bound transitions. The constructor arguments are proven from the State the record holds; a transition the policy refuses is the node's final rejection. |
| SignedRelease | [`contract.sil`](../../fixtures/toccata-v2/silver/p2sh-signed-release/contract.sil) | A P2SH deploy and spend: transaction v0 by default (the certified path), the v1 engine with `--tx-version 1` (there the constructor arguments are proven from the signer, and a wrong signer is refused before signing). |
| TwoOfTwo | [`twooftwo.sil`](../../packages/accounts/test/fixtures/v1-engine/phase2/twooftwo.sil) | A spend signed in turns by two parties: `silver engine draft prepare / sign / combine / finalize`, then `tx send`. Every signature is verified against its slot's key when drafts are combined and again at finalization. |

## OwnedCounter, step by step

The owner key is a constructor argument (the owner's x-only public key, the payload of its P2PK address); the value is
the covenant's State. `owned-ctor.json` holds `[{"kind":"bytes","value":[…32 bytes…]},{"kind":"int","value":10}]`.

```bash
hardkas silver compile contracts/owned-counter.sil --args owned-ctor.json
hardkas silver covenant genesis <compile-record> --from alice --amount 5 --constructor-args owned-ctor.json --wait
hardkas silver covenant transition <covenant-record> --policy bump --constructor-args owned-ctor.json --state-map '{"value":1}' --next-state next-15.json --args bob-delta-5.json --emit-args owned-ctor-15.json --wait
hardkas silver covenant inspect <covenant-id>
```

`bob-delta-5.json` is `[{"kind":"int","value":5},{"kind":"signature","account":"bob"}]`: the owner's signature is a
signature slot of the covenant entry, signed by the engine with the account's local key.

- The same transition signed by another account stops at `SIGNER_SLOT_KEY_MISMATCH` (the engine checks each signer's
  public key against the key the contract holds) before anything is signed. Nothing is sent.
- A transition whose delta is not positive, signed by the owner, passes the local checks: the engine does not run the
  policy. The node runs it and rejects the transaction (`SILVER_REJECTED_BY_NODE`, class `SCRIPT_POLICY_REJECTED`).
  The rejection is final: the transaction is never re-sent, and the covenant output stays unspent.
- `silver covenant inspect` rebuilds the lineage from the workspace's own records. It recomputes the genesis covenant id
  (consensus `covenant_id`), follows the transitions by the outpoints they spend, and asks the node whether the tip is
  unspent. It also checks that the tip's address commits to the declared state. The node has no query by covenant id:
  a transaction this workspace did not record is not seen, only its effect.

## Evidence

On 26-oct-2026 these four contracts ran with the CLI built from this tree, on an isolated canonical simnet node
(rusty-kaspad 2.1.0, its pinned image digest verified). Every step was accepted or refused as described above. Both
covenants' lineages were inspected as verified.

The tests pin the same behaviour without a node:

- `packages/sdk/test/reference-owned-counter.sdk.test.ts`
- `packages/sdk/test/covenant-lineage.sdk.test.ts`
- `packages/cli/test/silver-engine-draft.test.ts`

`packages/cli/test/reference-contracts.silverc.test.ts` checks that this folder's contract compiles, with the pinned
silverc, to the artifact those tests use.
