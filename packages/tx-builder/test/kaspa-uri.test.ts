import { describe, it, expect } from "vitest";
import { buildKaspaUri, sompiToKasDisplay } from "../src/kaspa-uri.js";

describe("sompiToKasDisplay", () => {
    it("converts whole KAS amounts", () => {
        expect(sompiToKasDisplay(100_000_000n)).toBe("1");
        expect(sompiToKasDisplay(500_000_000n)).toBe("5");
        expect(sompiToKasDisplay(0n)).toBe("0");
    });

    it("converts fractional amounts without trailing zeros", () => {
        expect(sompiToKasDisplay(150_000_000n)).toBe("1.5");
        expect(sompiToKasDisplay(123_456_789n)).toBe("1.23456789");
        expect(sompiToKasDisplay(100_000_001n)).toBe("1.00000001");
        expect(sompiToKasDisplay(10n)).toBe("0.0000001");
        expect(sompiToKasDisplay(1n)).toBe("0.00000001");
    });

    it("converts sub-KAS amounts", () => {
        expect(sompiToKasDisplay(1_000n)).toBe("0.00001");
        expect(sompiToKasDisplay(50_000_000n)).toBe("0.5");
    });

    it("rejects negative amounts", () => {
        expect(() => sompiToKasDisplay(-1n)).toThrow(/KASPA_URI_INVALID_AMOUNT/);
    });
});

describe("buildKaspaUri", () => {
    it("builds basic URI with amount", () => {
        const result = buildKaspaUri({
            address: "kaspatest:qqabc123",
            amountSompi: 100_000_000n
        });
        expect(result.uri).toBe("kaspa:kaspatest:qqabc123?amount=1");
        expect(result.amountKasDisplay).toBe("1");
        expect(result.amountSompi).toBe(100_000_000n);
    });

    it("builds URI with label and message", () => {
        const result = buildKaspaUri({
            address: "kaspatest:qqabc123",
            amountSompi: 250_000_000n,
            label: "Coffee Shop",
            message: "Order #42"
        });
        expect(result.uri).toBe("kaspa:kaspatest:qqabc123?amount=2.5&label=Coffee%20Shop&message=Order%20%2342");
        expect(result.params["label"]).toBe("Coffee Shop");
        expect(result.params["message"]).toBe("Order #42");
    });

    it("builds URI with zero amount (address only)", () => {
        const result = buildKaspaUri({
            address: "kaspatest:qqabc123",
            amountSompi: 0n
        });
        expect(result.uri).toBe("kaspa:kaspatest:qqabc123");
    });

    it("uses safe integer conversion — no floats", () => {
        // This is the exact case that broke the raw CheckoutService
        const result = buildKaspaUri({
            address: "kaspatest:qqabc123",
            amountSompi: 123_456_789n
        });
        expect(result.amountKasDisplay).toBe("1.23456789");
        // Verify no precision loss — the display string reconstructed back must equal
        expect(result.uri).toContain("amount=1.23456789");
    });

    it("handles tiny amounts correctly", () => {
        const result = buildKaspaUri({
            address: "kaspatest:qqabc123",
            amountSompi: 1n
        });
        expect(result.amountKasDisplay).toBe("0.00000001");
    });

    it("rejects empty address", () => {
        expect(() => buildKaspaUri({ address: "", amountSompi: 100n }))
            .toThrow(/KASPA_URI_INVALID_ADDRESS/);
    });

    it("rejects negative amount", () => {
        expect(() => buildKaspaUri({ address: "kaspatest:qqabc", amountSompi: -1n }))
            .toThrow(/KASPA_URI_INVALID_AMOUNT/);
    });

    it("includes claims", () => {
        const result = buildKaspaUri({
            address: "kaspatest:qqabc123",
            amountSompi: 100_000_000n
        });
        expect(result.claims.standardFormat).toBe(false);
    });
});
