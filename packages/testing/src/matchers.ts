// SAFETY_LEVEL: SIMULATION_ONLY
//
// Semantic assertion matchers for HardKAS transaction testing.
//
// No runtime import of vitest here: the main entry re-exports this module and
// vitest is an optional peer (only ./setup and ./scenarios load it). The type-only
// import anchors the augmentation below and is always erased.
import type { Assertion } from "vitest";
import { verifyLineage } from "@hardkas/artifacts";
import type { CovenantEvidenceLevel, CovenantTransitionResult, CovenantUtxoFixture } from "./covenant-testbed.js";

export interface CovenantPassMatcherOptions {
  /**
   * Minimum evidence level required to consider the transition validated.
   * Defaults to "SCRIPT_VM" so structural-only (SYNTHETIC) runs cannot silently pass as contract-validated.
   */
  minEvidence?: CovenantEvidenceLevel;
  /**
   * Set to true only when intentionally asserting structural-only (SYNTHETIC) validation.
   */
  allowSyntheticOnly?: boolean;
}

export interface HardKasMatchers<R = void> {
  /** Assert a receipt has status "accepted". */
  toBeAccepted(): R;
  /** Assert a receipt has status "failed". */
  toBeFailed(): R;
  /** Assert a receipt contains a valid txId (`synthetic-<64 hex>` or 64-char hex). */
  toHaveValidTxId(): R;
  /** Assert an artifact has a valid contentHash (64-char hex). */
  toHaveValidContentHash(): R;
  /** Assert an artifact passes lineage verification. */
  toPassLineageCheck(): R;
  /** Assert a GHOSTDAG result colors this block as blue. */
  toBeBlueBlock(): R;
  /** Assert a GHOSTDAG result colors this block as red. */
  toBeRedBlock(): R;
  /** Assert a balance (bigint sompi) increased by at least `amount`. */
  toHaveIncreasedBy(amount: bigint): R;
  /** Assert a balance (bigint sompi) decreased by at least `amount`. */
  toHaveDecreasedBy(amount: bigint): R;
  /** Assert a simulated DAG has no red blocks. */
  toHaveNoRedBlocks(): R;
  /** Assert a simulated DAG has exactly N tips. */
  toHaveDagWidth(width: number): R;
  /**
   * Assert a covenant transition passed at the required evidence level (`SCRIPT_VM` or `CONSENSUS_SIMNET` by default).
   * Rejects `SYNTHETIC`-only passes unless `{ allowSyntheticOnly: true }` or `{ minEvidence: "SYNTHETIC" }` is passed.
   */
  toPassCovenantTransition(options?: CovenantPassMatcherOptions): R;
  /** Assert a covenant transition was rejected, optionally matching failure code or diagnostic message. */
  toRejectCovenantTransition(expectedCodeOrMessage?: string | RegExp): R;
  /** Assert the covenant UTXO or transition successor carries the expected state fields. */
  toHaveCovenantState(expectedState: Record<string, unknown>, outputIndex?: number): R;
  /** Assert a covenant transition preserves the input covenantId across all successor outputs. */
  toPreserveCovenantId(expectedCovenantId?: string): R;
  /** Assert a covenant transition produces `expectedCount` covenant successor outputs (default: 1). */
  toProduceSuccessor(expectedCount?: number): R;
  /** Assert a covenant transition was rejected specifically by the Kaspa Script VM (`SCRIPT_VM`), optionally at a `.sil` line or pattern. */
  toRejectWithScriptError(expectedLineOrPattern?: number | string | RegExp): R;
  /** Assert a covenant transition's declared compute budget is within `maxBudget` and did not fail budget checks. */
  toConsumeComputeWithin(maxBudget: number): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends HardKasMatchers<T> {}
  interface AsymmetricMatchersContaining extends HardKasMatchers {}
}

export const hardKasMatchers = {
  toBeAccepted(received: any) {
    const pass = received?.status === "accepted";
    return {
      pass,
      message: () =>
        pass
          ? `Expected receipt NOT to be accepted, but status is "${received.status}"`
          : `Expected receipt to be accepted, but status is "${received?.status ?? "undefined"}"`
    };
  },

  toBeFailed(received: any) {
    const pass = received?.status === "failed";
    return {
      pass,
      message: () =>
        pass
          ? `Expected receipt NOT to be failed, but status is "failed"`
          : `Expected receipt to be failed, but status is "${received?.status ?? "undefined"}"`
    };
  },

  toHaveValidTxId(received: any) {
    const txId = received?.txId || (typeof received === "string" ? received : "");
    // Wave 1.4 · N4: ONE synthetic txId scheme (`synthetic-<64 hex>`) or a real 64-hex txId.
    const pass =
      typeof txId === "string" &&
      (/^synthetic-[0-9a-f]{64}$/.test(txId) || /^[0-9a-fA-F]{64}$/.test(txId));
    return {
      pass,
      message: () =>
        pass
          ? `Expected "${txId}" NOT to be a valid txId`
          : `Expected "${txId}" to be a valid txId (synthetic-<64 hex> or 64-char hex)`
    };
  },

  toHaveValidContentHash(received: any) {
    const hash = received?.contentHash || (typeof received === "string" ? received : "");
    const pass = typeof hash === "string" && /^[0-9a-fA-F]{64}$/.test(hash);
    return {
      pass,
      message: () =>
        pass
          ? `Expected "${hash}" NOT to be a valid content hash`
          : `Expected "${hash}" to be a valid content hash (64-char hex)`
    };
  },

  toPassLineageCheck(received: any) {
    // SURFACE-TRUTH-1A: the canonical structural lineage check (`verifyLineage`, strict, no parent to compare): the
    // block HardKAS writes, an object, is well formed and names the artifact's own identity. The former check wanted a
    // non-empty array, which no HardKAS artifact carries, so it failed on every real artifact.
    const result =
      received && typeof received === "object"
        ? verifyLineage(received, undefined, { strict: true })
        : { ok: false, issues: [{ code: "NOT_AN_ARTIFACT", severity: "error" as const, message: "not an artifact object" }] };
    const pass = result.ok;
    const codes = result.issues.filter((i) => i.severity === "error").map((i) => i.code);
    return {
      pass,
      message: () =>
        pass
          ? `Expected artifact NOT to pass lineage check`
          : `Expected artifact to pass lineage check (${codes.join(", ") || "invalid lineage"})`
    };
  },

  toBeBlueBlock(received: any) {
    const pass = received?.isBlue === true;
    return {
      pass,
      message: () =>
        pass
          ? `Expected block NOT to be blue, but it is`
          : `Expected block to be blue, but it is red or unknown`
    };
  },

  toBeRedBlock(received: any) {
    const pass = received?.isBlue === false;
    return {
      pass,
      message: () =>
        pass
          ? `Expected block NOT to be red, but it is`
          : `Expected block to be red, but it is blue or unknown`
    };
  },

  toHaveIncreasedBy(received: any, amount: bigint) {
    const actual = BigInt(received);
    const pass = actual >= amount;
    return {
      pass,
      message: () =>
        pass
          ? `Expected increase NOT to be at least ${amount}, but got ${actual}`
          : `Expected increase to be at least ${amount}, but got ${actual}`
    };
  },

  toHaveDecreasedBy(received: any, amount: bigint) {
    const actual = BigInt(received);
    const pass = actual >= amount;
    return {
      pass,
      message: () =>
        pass
          ? `Expected decrease NOT to be at least ${amount}, but got ${actual}`
          : `Expected decrease to be at least ${amount}, but got ${actual}`
    };
  },

  toHaveNoRedBlocks(received: any) {
    const redBlocks = Object.values(received?.blocks || {}).filter(
      (b: any) => b.isBlue === false
    );
    const pass = redBlocks.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `Expected DAG to have red blocks, but it has none`
          : `Expected DAG to have no red blocks, but found ${redBlocks.length}`
    };
  },

  toHaveDagWidth(received: any, width: number) {
    // Width is count of tips
    const allBlockIds = Object.keys(received?.blocks || {});
    const parentIds = new Set();
    for (const block of Object.values(received?.blocks || {}) as any) {
      for (const p of block.parents) {
        parentIds.add(p);
      }
    }
    const tips = allBlockIds.filter((id) => !parentIds.has(id));
    const pass = tips.length === width;
    return {
      pass,
      message: () =>
        pass
          ? `Expected DAG NOT to have width ${width}, but it does`
          : `Expected DAG to have width ${width}, but got ${tips.length}`
    };
  },

  toPassCovenantTransition(received: CovenantTransitionResult, options?: CovenantPassMatcherOptions) {
    const minEvidence: CovenantEvidenceLevel =
      options?.minEvidence ?? (options?.allowSyntheticOnly ? "SYNTHETIC" : "SCRIPT_VM");
    const rank: Record<CovenantEvidenceLevel, number> = {
      SYNTHETIC: 1,
      SCRIPT_VM: 2,
      CONSENSUS_SIMNET: 3
    };
    const actualEvidence = received?.evidenceLevel;
    const evidenceSufficient =
      actualEvidence !== undefined && rank[actualEvidence] >= rank[minEvidence];
    const pass = received?.passed === true && evidenceSufficient;
    const loc = received?.diagnostic?.location;
    const vmLoc = loc ? ` at .sil:${loc.line}:${loc.column}` : "";
    const reason =
      received?.diagnostic?.message ??
      received?.structuralErrorMessage ??
      received?.vmResult?.blockedReason ??
      "unknown failure";
    return {
      pass,
      message: () => {
        if (pass) {
          return `Expected covenant transition NOT to pass at ${actualEvidence} (${received.status})`;
        }
        if (received?.passed === true && !evidenceSufficient) {
          return `Covenant transition passed structural checks only (evidenceLevel="${actualEvidence}", status="${received?.status}"), which is below required "${minEvidence}". Structural validation does NOT execute the SilverScript VM. Pass { allowSyntheticOnly: true } only when intentionally testing structural preflight.`;
        }
        return `Expected covenant transition to pass (minEvidence="${minEvidence}"), but it failed with status "${received?.status ?? "UNKNOWN"}" [${received?.structuralErrorCode ?? "SCRIPT_VM"}]${vmLoc}: ${reason}`;
      }
    };
  },

  toRejectCovenantTransition(received: CovenantTransitionResult, expectedCodeOrMessage?: string | RegExp) {
    // R-01: neither BLOCKED (nothing evaluated) nor CONSENSUS_SIMNET_INCONCLUSIVE (nothing established) is a rejection
    const isRejected =
      received?.passed === false &&
      received?.status !== "BLOCKED" &&
      received?.status !== "CONSENSUS_SIMNET_INCONCLUSIVE";
    const haystack = [
      received?.status ?? "",
      received?.structuralErrorCode ?? "",
      received?.structuralErrorMessage ?? "",
      received?.diagnostic?.message ?? "",
      received?.diagnostic?.failedStatement ?? "",
      received?.diagnostic?.rawStderr ?? "",
      received?.consensus?.detail ?? ""
    ].join("\n");

    const matchesPattern =
      expectedCodeOrMessage === undefined
        ? true
        : typeof expectedCodeOrMessage === "string"
          ? haystack.includes(expectedCodeOrMessage)
          : expectedCodeOrMessage.test(haystack);

    const pass = isRejected && matchesPattern;
    return {
      pass,
      message: () => {
        if (pass) {
          return `Expected covenant transition NOT to be rejected${expectedCodeOrMessage ? ` matching ${String(expectedCodeOrMessage)}` : ""}, but it failed with ${received?.status} [${received?.structuralErrorCode ?? "SCRIPT_VM"}]: ${received?.diagnostic?.message ?? received?.structuralErrorMessage}`;
        }
        if (!isRejected) {
          return `Expected covenant transition to be rejected${expectedCodeOrMessage ? ` matching ${String(expectedCodeOrMessage)}` : ""}, but got status="${received?.status}", passed=${String(received?.passed)} (evidenceLevel="${received?.evidenceLevel}")`;
        }
        return `Expected covenant transition rejection to match ${String(expectedCodeOrMessage)}, but got status="${received?.status}", code="${received?.structuralErrorCode ?? "NONE"}", message="${received?.diagnostic?.message ?? received?.structuralErrorMessage ?? ""}"`;
      }
    };
  },

  toHaveCovenantState(
    received: CovenantTransitionResult | CovenantUtxoFixture,
    expectedState: Record<string, unknown>,
    outputIndex = 0
  ) {
    const actualState: Readonly<Record<string, unknown>> | undefined =
      received && "successorUtxos" in received
        ? received.successorUtxos[outputIndex]?.state
        : (received as CovenantUtxoFixture | undefined)?.state;

    const normalizeVal = (v: unknown): string => {
      if (v && typeof v === "object" && "kind" in v && "value" in v) {
        return normalizeVal((v as { value: unknown }).value);
      }
      if (typeof v === "bigint" || typeof v === "number") return String(v);
      if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
      if (Array.isArray(v)) {
        if (v.every((item) => typeof item === "number" && item >= 0 && item <= 255)) {
          return Buffer.from(v as number[]).toString("hex");
        }
        return JSON.stringify(v.map(normalizeVal));
      }
      return JSON.stringify(v);
    };

    const mismatches: string[] = [];
    if (!actualState) {
      mismatches.push(`no covenant state found at outputIndex=${outputIndex}`);
    } else {
      for (const [k, expectedVal] of Object.entries(expectedState)) {
        if (!(k in actualState)) {
          mismatches.push(`missing state field "${k}"`);
        } else if (normalizeVal(actualState[k]) !== normalizeVal(expectedVal)) {
          mismatches.push(
            `field "${k}": expected ${normalizeVal(expectedVal)}, got ${normalizeVal(actualState[k])}`
          );
        }
      }
    }

    const pass = mismatches.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `Expected covenant state NOT to match ${JSON.stringify(expectedState, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`
          : `Expected covenant state to match, but found mismatches: ${mismatches.join("; ")}`
    };
  },

  toPreserveCovenantId(received: CovenantTransitionResult, expectedCovenantId?: string) {
    const inputCovId = expectedCovenantId ?? received?.covenantId;
    const successors = received?.successorUtxos ?? [];
    const pass =
      typeof inputCovId === "string" &&
      /^[0-9a-fA-F]{64}$/.test(inputCovId) &&
      successors.length > 0 &&
      successors.every((s) => s.covenantId?.toLowerCase() === inputCovId.toLowerCase());
    return {
      pass,
      message: () =>
        pass
          ? `Expected transition NOT to preserve covenantId ${inputCovId}`
          : `Expected transition to preserve covenantId ${inputCovId ?? "<missing>"} across ${successors.length} successor(s), got [${successors.map((s) => s.covenantId ?? "<none>").join(", ")}]`
    };
  },

  toProduceSuccessor(received: CovenantTransitionResult, expectedCount = 1) {
    const successors = received?.successorUtxos ?? [];
    const validScripts = successors.every(
      (s) => typeof s.scriptPublicKey === "string" && s.scriptPublicKey.length > 0
    );
    const pass = successors.length === expectedCount && validScripts;
    return {
      pass,
      message: () =>
        pass
          ? `Expected transition NOT to produce ${expectedCount} successor output(s)`
          : `Expected transition to produce ${expectedCount} valid successor output(s), but got ${successors.length}`
    };
  },

  toRejectWithScriptError(
    received: CovenantTransitionResult,
    expectedLineOrPattern?: number | string | RegExp
  ) {
    const isVmFailure =
      received?.passed === false &&
      received?.status === "SCRIPT_VM_FAIL" &&
      received?.vmResult?.passed === false;
    const diag = received?.diagnostic;

    let matchesExtra = true;
    if (expectedLineOrPattern !== undefined) {
      if (typeof expectedLineOrPattern === "number") {
        matchesExtra = diag?.location?.line === expectedLineOrPattern;
      } else {
        const text = [
          diag?.message ?? "",
          diag?.failedStatement ?? "",
          diag?.rawStderr ?? ""
        ].join("\n");
        matchesExtra =
          typeof expectedLineOrPattern === "string"
            ? text.includes(expectedLineOrPattern)
            : expectedLineOrPattern.test(text);
      }
    }

    const pass = isVmFailure && matchesExtra;
    return {
      pass,
      message: () => {
        if (pass) {
          return `Expected transition NOT to fail in SCRIPT_VM${expectedLineOrPattern !== undefined ? ` matching ${String(expectedLineOrPattern)}` : ""}`;
        }
        if (!isVmFailure) {
          return `Expected transition to fail in SCRIPT_VM, but passed=${String(received?.passed)}, status="${received?.status ?? "NONE"}", code="${received?.structuralErrorCode ?? "NONE"}"`;
        }
        return `Expected SCRIPT_VM failure to match ${String(expectedLineOrPattern)}, but got line=${String(diag?.location?.line)} (${diag?.sourceLocationStatus}), message="${diag?.message}", failedStatement="${diag?.failedStatement ?? ""}"`;
      }
    };
  },

  toConsumeComputeWithin(received: CovenantTransitionResult, maxBudget: number) {
    const budget = received?.computeBudgetUsed;
    const budgetFailed =
      received?.structuralErrorCode === "COMPUTE_BUDGET_INSUFFICIENT" ||
      received?.structuralErrorCode === "COMPUTE_BUDGET_EXCEEDED" ||
      received?.structuralErrorCode === "COMPUTE_BUDGET_NON_POSITIVE";
    const pass =
      typeof budget === "number" &&
      Number.isFinite(budget) &&
      budget > 0 &&
      budget <= maxBudget &&
      !budgetFailed;
    return {
      pass,
      message: () =>
        pass
          ? `Expected transition computeBudgetUsed (${budget}) NOT to be within ${maxBudget}`
          : `Expected transition computeBudgetUsed (${String(budget)}) to be within (0, ${maxBudget}] and pass budget validation (structuralErrorCode="${received?.structuralErrorCode ?? "NONE"}")`
    };
  }
};
