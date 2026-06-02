# HardKAS 0.7.12-alpha: SDK Product-Market Fit & DX Friction

The Phase 7-B Revenge Run proved that HardKAS is evolving successfully beyond a CLI tool into an adoptable framework. The public NPM installation hurdle is fully solved. 

However, Developer Friction (DX) remains high in specific domains:

## 1. Node.js Ergonomics (Friction: 4/10)
**Verdict**: Usable, but has sharp edges.
Node apps saw a massive leap in success rates (0 -> 9). The `Hardkas.create()` facade feels native. 
**Major Gaps**:
- `hardkas.accounts.fund()` defaulting to a hardcoded string (`'default'`) instead of looking up the local active simulated wallet causes massive cascading failures for new developers relying on documentation examples.
- No programmatic way to sync the query store (`query store sync` requires a CLI fallback).

## 2. React / Frontend DX (Friction: 7/10)
**Verdict**: Extremely painful for hook-based architectures.
React works fine if users just import `Hardkas` as a class. But the ecosystem standard dictates hooks. The absence or failure of `@hardkas/react` meant that any app attempting to use `useHardkas()` or context wrappers crashed completely. This is a P1 Product Gap if we want HardKAS to drive dApp creation.

## 3. Data Extraction (Friction: 9/10)
**Verdict**: Immature.
Attempts to perform SQL queries (`query sql`) or deep transaction state extraction failed because those commands do not exist or aren't mapped. Developers building indexers or explorers cannot easily extract data without using the CLI.

## Summary 
HardKAS is mathematically proven to be deployable in standard NPM environments now. Focus must shift from "does it install?" to "is it enjoyable to use?" The next priority should be fixing `accounts.fund`, releasing `@hardkas/react`, and fleshing out the read-heavy SDK methods.
