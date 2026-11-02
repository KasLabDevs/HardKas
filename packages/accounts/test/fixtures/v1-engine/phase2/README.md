# Phase 2 covenant fixtures (silverc v1.0.0)

Sources: the covenant declaration fixtures and the KCC-20 example of kaspanet/silverscript v1.0.0
(`silverscript-lang/tests/covenant_declaration_ast_fixtures/*.sil`, `silverscript-lang/tests/examples/kcc20.sil`),
each with `pragma silverscript ^0.1.0;` prepended. ISC License, Copyright 2026 Kaspa Developers.

| Source | Topology | Constructor arguments |
| --- | --- | --- |
| fanout.sil | auth 1:N transition (`to = max_outs`) | int 3, int 10 |
| matrix.sil | cov N:M transition, leader + delegate | int 2, int 2, int 100, bytes32 0x07…07 |
| terminable.sil | auth singleton transition, `termination = allowed` | int 100, bytes32 0x07…07 |
| kcc20.sil | cov N:M verification (`newStates`, `sig s`, `byte witness`), delegate body | bytes32 0x09…09, int 1000, byte 0, bool false, int 2, int 2 |
| twooftwo.sil | P2SH, two signature slots (HardKAS's own; silverc 1.0.0 refuses `checkMultiSig`) | pubkey of key 0x11…11, pubkey of key 0x22…22 |
| implicitto.sil | auth transition returning one State with no `to` (lowered by silverc to exactly one continuation) | int 100, bytes32 0x07…07 |

`*.artifact.json`: the bytes the pinned silverc (binary sha256 ce1e0ef5…) writes for those arguments.
`*.ast.json`: the official parser's AST (`silverc --ast-only`). Regenerated with `hkl1\v1e\scripts\p2-compile.mjs`
(`implicitto`: `hkl1\v1e\scripts\save-fixture.mjs`, from `lowers_auth_transition_two_field_state.sil`).