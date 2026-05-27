# Local Limits

HardKAS is a local developer runtime. You must be explicitly aware of its limitations before attempting to graduate to production.

## Finality
**Localnet results are not mainnet finality.** 
A transaction that passes instantly in the `simulated` localnet may face totally different constraints, block times, mempool rejections, or congestion on Kaspa Mainnet.

## Replay Coverage
**Replay coverage is partial.**
We support deterministic replay of well-known workflows (transfers, policy checks). However, heavily asynchronous scripts, external dependencies, or unsupported artifact types will simply return an `unsupported` status. Replay is a local diagnostic tool, not an EVM consensus emulator.

## Smart Contracts & Covenants
**No covenant/SilverScript/Tockata execution yet.**
If you see script metadata in artifacts, it represents *future readiness* and local *observational intent*. HardKAS does not currently execute or validate these scripts against an active L1 covenant runtime.

## L2 / Igra
**No production bridge.**
L2 features are experimental. There are absolutely no trustless exits. Do not use local HardKAS Igra integration with real assets.
