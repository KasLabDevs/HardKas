# HardKAS AI Change Policy

This policy governs autonomous modifications to the HardKAS repository by AI agents.

## Core Directives

1. **Identify a real Builder Lab blocker.** Do not add speculative features or primitives.
2. **Write BLOCKER.md.** Document the exact failure in the consuming lab.
3. **State existing API.** Document what the API currently looks like.
4. **State why it is insufficient.** Prove that the existing API cannot solve the lab's problem.
5. **Propose smallest new primitive.** Design the most constrained addition possible.
6. **Do not modify architecture beyond blocker scope.**
7. **Add regression test reproducing blocker.** Prove that the core issue is fixed.
8. **Build/typecheck/test entire monorepo.** Ensure no global regressions.
9. **Pack/publish RC.**
10. **Validate from external consumer.**
11. **Do not use workspace/file/link dependencies for qualification.**

## CRITICAL RULE

**DO NOT "FIX" FAILING BLACK-BOX TESTS BY MODIFYING THE CONSUMER UNLESS THE CONSUMER IS PROVABLY WRONG.**

Fixing the consumer to hide a framework bug is strictly forbidden. The goal is to harden the SDK, not artificially turn tests green.
