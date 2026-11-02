# l2-evm (HardKAS)

A minimal Solidity project for the HardKAS l2 extension (experimental). It compiles offline with pinned, verified tools.

```bash
npx hardkas toolchain install foundry   # once, explicit (or --from-file <asset> offline)
npx hardkas toolchain install solc      # once, explicit (or --from-file <asset> offline)
npx hardkas l2 compile                  # forge + solc 0.8.38, offline; writes out/ and .hardkas/l2-build.json
npx hardkas l2 compile --check          # rebuilds into a temporary directory and compares the bytecode
```

- No dependency is fetched: there is no forge-std and no git submodule. The tests in `test/` are plain Solidity.
- `foundry.toml` sets `offline = true` and `auto_detect_solc = false`, so even a plain `forge build` never downloads a
  compiler.
- `evm_version = "cancun"` is a **provisional** target. It does not show that Igra runs this EVM version; check the
  target network before deploying.
- The local node: `npx hardkas l2 node start` (Anvil on 127.0.0.1, chain id 31337).
