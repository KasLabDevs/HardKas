Repository: kaspanet/silverscript
Title: Publish `cli-debugger` binaries with releases

`silverc` ships as a release asset for five platforms (v1-rc1, v1.0.0), but `cli-debugger` does not. Tools that want to run `.test.json` contract tests have to build it from source, which means every user needs a Rust toolchain.

Request: attach `cli-debugger` binaries to future releases, for the same platforms as `silverc`, so that tooling can pin and verify the runner the same way it pins the compiler.

Related:
- The workspace pins rusty-kaspa `a41a333b`, 13 commits behind v2.1.0, the current node release. #256 describes what `silverscript-abi` needs in order to build against v2.1.0. A release built on 2.1.x would run the same script engine as current nodes.
- #253: in test-file mode, the active input's `signature_script_hex` is never executed. If the runner is distributed as a binary, this should be documented in the test-file section.

Context: HardKAS, a Kaspa development toolchain, drives `cli-debugger` as an optional runner for tests of compiled contracts. Today we can only tell users to build it from v1.0.0 with cargo.
