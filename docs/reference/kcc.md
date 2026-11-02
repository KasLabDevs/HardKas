---
title: KCC-1, KCC-2 and KCC-20 support
description: What HardKAS implements of the Kaspa Covenant Conventions KCC-1, KCC-2 and KCC-20, clause by clause, and how it is checked.
---

# KCC-1, KCC-2 and KCC-20 support

The Kaspa Covenant Conventions (KCCs, `kaspanet/kccs`) are ecosystem conventions on top of Kaspa L1 covenants. They
change no consensus rule. At commit `1ed87aef59faff8354061aee30f734a3b8b2c3d2` (2026-10-21) three of them are Final:

| KCC | Title | What it is |
| :-- | :-- | :-- |
| KCC-1 | Covenant Concepts, Byte Layouts, and ABI | The covenant ABI: codecs, dispatch tags, P2SH envelope, state, templates, roles, virtual elements. Not a token standard. |
| KCC-2 | Authority Schemes | A registry of authority schemes (key, key hash, script, covenant lineage) and their minimum approval checks. Not a token standard. |
| KCC-20 | Fungible Token Covenant Specification | Fungible tokens held in covenant UTXOs, built on KCC-1 and KCC-2. |

KCC-20 is not KRC-20. KRC-20 (Kasplex) records token operations as inscriptions that off-chain indexers interpret.
KCC-20 balances are covenant UTXOs whose rules the token's covenant program enforces on L1.

## Where it lives

- **API** (`@hardkas/core`): `kcc1*` (ABI), `kcc2*` (authority schemes), `kcc20*` (tokens), and SilverScript interop
  (`kcc1SilverDispatchTags`, `kcc20SilverStateLayout`, `kcc20SilverProgramState`).
- **CLI**: `hardkas kcc dispatch`, `hardkas kcc template-hash`, `hardkas kcc20 encode-state`, `decode-state`, `check`,
  `artifact` (see the [CLI reference](./cli.md)).
- **Example**: `examples/11-kcc20-token`.

## How it is checked

| Level | What runs |
| :-- | :-- |
| Canonical | Every machine-readable conformance vector of KCC-1, KCC-2 and KCC-20 at the pinned commit (copies with their SHA-256 in `packages/core/test/fixtures/kcc`), HardKAS's negative tests, and property tests of the KCC-20 invariants. |
| silverc | Against the reference implementation KCC-20 links (`argent-lang/kcc20-reference` @ `27f8403f`, read from a pinned checkout): same vectors, its program artifact, its dispatch tags, a byte-identical compilation of its `KCC20.sil` with HardKAS's pinned silverc, its state as a KCC-1 template view. |
| SilverScript runner | The reference program's `transfer` and `transfer_delegator` on the Kaspa script engine (an UNVERIFIED local runner build), with real Schnorr signatures, each verdict compared with HardKAS's model. |
| Simnet | Real token UTXOs of the reference program on an isolated rusty-kaspad v2.1.0 simnet node (`packages/testing/test/kcc20-reference.simnet.test.ts`, `examples/11-kcc20-token/test/`): a covenant genesis, signed v1 transfers the node accepts and confirms, and invalid ones it rejects (conservation, signer, owner scheme, negative amount, extension commitment, output count, continuation program, covenant id); a delegator; owner schemes p2pk-schnorr, p2pkh-schnorr, p2sh and covenant-id; borrowed receive under all three borrow schemes; amounts at 2^53 + 1 and 2^63 - 1. Each case also gets the model's verdict. |

Script-engine verdicts are contract execution only, not transaction validity. The node level covers the cases listed
above on simnet; not testnet or mainnet, and not the p2pkh-ecdsa/v1 owner scheme (kaspa-wasm 2.1.0 has no ECDSA input
signer). The transactions of the node tests are assembled by the tests: HardKAS has no KCC-20 transaction builder.

## Conformance matrix

"Vectors" means the official machine-readable vectors pass; "HardKAS tests" means HardKAS's own tests, where the
standard has no vector. "Model" means off chain only.

### KCC-1

| Clause | Requirement | Status | Evidence |
| :-- | :-- | :-- | :-- |
| §3.2.1 | Hash = BLAKE3 (unkeyed, keyed with Key32); key ≤ 32 bytes | Implemented | Vectors `hash_function`; key-length test |
| §3.4.1 | Canonical type names; identifiers; N in base ten | Implemented | Vectors `canonical_type_names`; parse tests |
| §3.4.2 | PushMinimal and PushExplicit | Implemented | Vectors `data_pushes` |
| §3.4.3-3.4.4 | int (minimal ScriptNum argument, 8-byte signed magnitude in state), scalar payloads | Implemented | Vectors `scalar_encodings`, int rejections |
| §3.4.5-3.4.6 | Arrays, record lowering, record-array grouping, width rules | Implemented | Vectors `composite_encodings`, array and record rejections |
| §3.4.7 | Value locations (roots, field and index paths) | Partly: field and index paths inside a value the caller has decoded (`kcc1ResolveLocation`); roots (a named value, an entrypoint argument) are not modelled | HardKAS tests (no vector) |
| §3.4.8 | Semantic annotations change no encoding | Not applicable | No artifact format is defined; nothing to implement in bytes |
| §3.5-3.5.2 | FunctionSignature, dispatch tag, distinct tags, PushArguments | Implemented | Vectors `dispatch_and_arguments`, `zero_argument_dispatch`, `record_dispatch`, collision rejections |
| §3.6 | P2SH envelope, signature-script layout | Implemented | Vector `p2sh_envelope`; layout rejection tests |
| §3.7.1 | EncodeState and strict decoding | Implemented | Vector `state_encoding`; 11 state rejections |
| §3.7.2 | Reading a consumed state | Implemented | HardKAS tests (no vector) |
| §3.7.3 | TemplateHash with LE64 lengths; verify before use | Implemented (`kcc1VerifyTemplateHash`; verifying claimed template parts before `kcc1ContinuationProgram` uses them is the caller's step) | Vectors `template_hashes` |
| §3.7.4 | Template views of complete consecutive fields | Implemented | Vectors `template_views` |
| §3.7.5 | Continuation program and its script public key | Implemented | Vector `continuation_program` |
| §3.8, §3.8.1 | Leader and delegator roles by input order | Implemented (role assignment) | HardKAS tests; the transition rules themselves are each program's (on chain) |
| §3.9, §3.9.1 | Virtual elements, hash-committed scheme | Implemented | Vector `hash_committed_virtual_element` |

### KCC-2

| Clause | Requirement | Status | Evidence |
| :-- | :-- | :-- | :-- |
| §2.1 | Registry: 0x00-0x04 assigned, 0x05-0x7f refused, 0x80-0xff custom with a full definition | Implemented | Vectors `registry_checks`; reserved and custom tests |
| §2.1 | Authority value types and exact lengths; encodings without the scheme byte | Implemented | Vectors `constructions` |
| §2.2 | p2pk and p2pkh minimum checks (key shape, Hash(pubkey), signature) | Implemented; the signature result is the caller's | Vectors `approval_checks` (signature results stipulated, as KCC-2 fixes no message) |
| §2.3.1 | p2sh: an input with the version-0 envelope; index witness in range | Implemented | Vectors; index-witness tests |
| §2.3.2 | covenant-id: an input of the lineage (outputs do not count) | Implemented | Vectors |
| §2.4 | Conventions define role, fields, subset, rules | Applied by KCC-20 below | — |

### KCC-20

| Clause | Requirement | Status | Evidence |
| :-- | :-- | :-- | :-- |
| §1 | KCC20State layout (112 encoded bytes); amount non-negative | Implemented | Vectors `state_record`, `state_encoding`; reference compiled layout |
| §2 | transfer / transfer_delegator, dispatch tags, argument layout | Implemented | Vectors `dispatch`, `transfer_arguments`; reference tags; SDK and KCC-1 encoders agree |
| §2 | Witness path byte (00 normal, 01 borrowed, others refused); owner witnesses per scheme | Implemented | Vectors `owner_witness`, `standard_transfer` |
| §2 | Supported owner schemes on every successor; bounds; conservation; one extension commitment | Implemented (model) | Vectors `standard_transfer`; property tests; the reference program rejects the same cases in the script engine |
| §2 | The leader validates each continuation's program, state and covenant binding | Partly (model): states only. Programs (script public keys) and covenant bindings are not checked off chain | The reference program checks them in the script engine (runner level); on simnet the node rejects an output locked to another state and a tampered covenant id, which the model accepts |
| §2 | Optional 2^63 - 1 total limit | Implemented (configurable, on by default like the reference) | HardKAS tests |
| §3 | Program artifact: entrypoints, owner schemes, bounds | Implemented for the reference's `kcc20.json` form | Reference artifact |
| §4 | Extension commitment opaque, preserved; fungibility only between equal commitments | Implemented (model) | Vectors; property test |
| §5 | Borrow schemes 00-03; threshold (negative as zero); signature; hash chain; preserved fields; KAS value | Implemented (model) | Vectors `borrow_witness`, `hash_chain`, `borrowed_receive` (16 cases, alone and inside complete transfers); the reference program agrees in the script engine at and above the threshold |

## Limits

- **Signatures.** KCC-2 and KCC-20 fix no signed message or sighash. HardKAS's model takes a signature result from the
  caller; the CLI lists every signature as not verified. In the runner tests, the covenant program checks real
  signatures.
- **Continuation programs and bindings.** The model checks the successors' states, not the outputs' programs or
  covenant bindings; the caller supplies the family's outputs. The token's program checks them on chain.
- **Entrypoints, family and input states.** The model does not check which entrypoint each input calls (`transfer` for
  the leader, `transfer_delegator` for the others). It takes the family and the leader's position from the order of the
  inputs it is given, and the input states as the caller supplies them: they are not decoded from the authenticated
  programs the inputs spend. The token's program checks all three on chain.
- **Zero outputs.** KCC-20 sets no minimum: the model accepts a transfer of zero-amount states with no continuation
  outputs; the reference program requires at least one output.
- **No covenant program of its own.** HardKAS implements the conventions around a token's program (encoding, decoding,
  checking). It does not ship or generate a KCC-20 program; the reference program is compiled from its own source.
- **Artifact format.** KCC-1 and KCC-20 fix what an artifact describes, not how; HardKAS reads the reference's
  `kcc20.json` form.
- **Node level: simnet only.** The node tests send KCC-20 transactions to an isolated simnet node; none has been sent
  to testnet or mainnet. The p2pkh-ecdsa/v1 owner scheme is checked off chain only.
- **Stricter than the conventions, on purpose** (each refuses input the conventions do not forbid outright):
  - a record-array element type that lowers to no field (`E[2]` of an empty record): its count could not be encoded;
  - the entrypoint grammar of `kcc20.json` artifacts (identifier names only);
  - a KCC-20 configuration needs a delegator entrypoint;
  - KCC-20 owner schemes must be standard KCC-2 schemes (0x00-0x04): custom schemes (0x80-0xff) are refused, because
    their checks are not defined for a token.
- **Encoder limits.** `kcc20EncodeState` refuses a negative amount (KCC-20 §1); `hardkas kcc20 check` refuses a KAS
  value past 2^64 - 1; a state layout that names a field twice is refused when encoding and decoding.
