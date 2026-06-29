import { describe, it, expect } from "vitest";
import { getRequiredConfirmations } from "../src/confirmation-policy.js";

describe("ConfirmationPolicy", () => {
    const SOMPI_PER_KAS = 100_000_000n;

    it("low value thresholds (< 1000 KAS)", () => {
        const amountSompi = 500n * SOMPI_PER_KAS; // 500 KAS

        expect(getRequiredConfirmations({ amountSompi, riskProfile: "lenient" }).requiredConfirmations).toBe(1);
        expect(getRequiredConfirmations({ amountSompi, riskProfile: "standard" }).requiredConfirmations).toBe(2);
        expect(getRequiredConfirmations({ amountSompi, riskProfile: "strict" }).requiredConfirmations).toBe(10);
    });

    it("medium value thresholds (1000 - 10000 KAS)", () => {
        const amountSompi = 5000n * SOMPI_PER_KAS; // 5000 KAS

        expect(getRequiredConfirmations({ amountSompi, riskProfile: "lenient" }).requiredConfirmations).toBe(5);
        expect(getRequiredConfirmations({ amountSompi, riskProfile: "standard" }).requiredConfirmations).toBe(10);
        expect(getRequiredConfirmations({ amountSompi, riskProfile: "strict" }).requiredConfirmations).toBe(30);
    });

    it("high value thresholds (> 10000 KAS)", () => {
        const amountSompi = 15000n * SOMPI_PER_KAS; // 15000 KAS

        expect(getRequiredConfirmations({ amountSompi, riskProfile: "lenient" }).requiredConfirmations).toBe(10);
        expect(getRequiredConfirmations({ amountSompi, riskProfile: "standard" }).requiredConfirmations).toBe(30);
        expect(getRequiredConfirmations({ amountSompi, riskProfile: "strict" }).requiredConfirmations).toBe(60);
    });

    it("defaults to standard risk profile", () => {
        const amountSompi = 500n * SOMPI_PER_KAS;
        const result = getRequiredConfirmations({ amountSompi });
        expect(result.requiredConfirmations).toBe(2);
        expect(result.riskProfile).toBe("standard");
    });

    it("includes explicit claims in the response", () => {
        const result = getRequiredConfirmations({ amountSompi: 100n });
        expect(result.model).toBe("merchant-static-v1");
        expect(result.claims.absoluteFinality).toBe(false);
        expect(result.claims.economicSafetyGuarantee).toBe(false);
        expect(result.claims.merchantPolicyOnly).toBe(true);
    });

    it("rejects negative amounts", () => {
        expect(() => getRequiredConfirmations({ amountSompi: -100n }))
            .toThrow(/CONFIRMATION_POLICY_INVALID_AMOUNT/);
    });

    it("rejects non-bigint types (floats/strings)", () => {
        // We cast as any to bypass TS for the runtime test
        expect(() => getRequiredConfirmations({ amountSompi: 100.5 as any }))
            .toThrow(/CONFIRMATION_POLICY_INVALID_AMOUNT/);
        
        expect(() => getRequiredConfirmations({ amountSompi: "100" as any }))
            .toThrow(/CONFIRMATION_POLICY_INVALID_AMOUNT/);
    });

    it("is deterministic", () => {
        const res1 = getRequiredConfirmations({ amountSompi: 5000n * SOMPI_PER_KAS, riskProfile: "strict" });
        const res2 = getRequiredConfirmations({ amountSompi: 5000n * SOMPI_PER_KAS, riskProfile: "strict" });
        expect(res1).toEqual(res2);
    });
});
