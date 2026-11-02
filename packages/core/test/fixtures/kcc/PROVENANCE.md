# KCC conformance vectors

Copied byte for byte from `kaspanet/kccs` at commit `1ed87aef59faff8354061aee30f734a3b8b2c3d2` (2026-10-21, "KCC-1:
advance to Final (#39)"), where KCC-1, KCC-2 and KCC-20 are Final. The repository is released under CC0 1.0 Universal
(`LICENSE.md`, SPDX-License-Identifier: CC0-1.0). The machine-readable vectors are the authoritative conformance vectors
of each standard (KCC-0 §5 and §9).

| File here | Source path | SHA-256 | Git blob |
| :-- | :-- | :-- | :-- |
| `kcc-0001-conformance.json` | `kcc-0001/vectors/conformance.json` | `5a8ae724de9031d3390ded7873df74002ec29a771c5fbc56e1e43d2a9ae26b59` | `c55d6a8dbce3c0191af97f1d43ae44a34c5a9df1` |
| `kcc-0002-authority-schemes.json` | `kcc-0002/vectors/authority-schemes.json` | `1ff8e2169203b7e52a065fee20c8551b059fb955dc69a91c332ffd6f7cde5835` | `6db2925ae5d54f1ab29dcc0f0c403e078d6bcafb` |
| `kcc-0020-conformance.json` | `kcc-0020/vectors/conformance.json` | `9b424c96ea0e0093cacfd98e3013fd5cbf93dd149cb27696acf288510133010b` | `5432a8a060b70fec6e19a9b28f56dd93992ab60f` |

The conformance tests check these digests before they read the files. Do not edit the files: a newer KCC revision is a
new copy with its own commit and digests.
