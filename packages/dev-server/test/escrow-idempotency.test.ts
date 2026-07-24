import { describe, it, expect } from "vitest";

const BASE_URL = "http://127.0.0.1:3000";
const headers = { "Content-Type": "application/json", "X-Hardkas-Request": "true" };

let config = {
    buyer: { publicKeyHex: "030a5996ccb6b3e80c85c2921c5720bcff27d2c3e1e69da5c50674ed4466b02662" }, 
    seller: { publicKeyHex: "03a85b9b8b7ed6fc01b7a2d4b8be357e60ea9b02a2491a5e128cc1e9fdf5522731" }, 
    arbiter: { publicKeyHex: "023ab915359756b5394208bd165b5120ec0be4061a1290380c5ce54460decfb881" }, 
    buyerDestinationSpk: "20f69a597a760c2d3eddb5e6db24e39ee0b3b429188e63cc8d8174f8cfb5e11bbdac",
    sellerDestinationSpk: "208d1f2a36b5ec63251ed7a69b0fa6bb781e6a928421c97a5b3eeef52bc5da8669ac",
    refundAmount: "100000000", 
    releaseAmount: "100000000"
};

describe("Idempotency Matrix", () => {
    let id = "";

    it("setup idempotent test", async () => {
        const createRes = await fetch(`${BASE_URL}/api/escrows`, { method: "POST", headers, body: JSON.stringify(config) });
        id = (await createRes.json()).data.id;
        await fetch(`${BASE_URL}/api/escrows/${id}/fund`, { method: "POST", headers });
    }, 60000);

    it("should allow repeating prepare safely", async () => {
        const prep1 = await fetch(`${BASE_URL}/api/escrows/${id}/release/prepare`, { method: "POST", headers, body: JSON.stringify({ branch: "mutualRelease" }) });
        expect((await prep1.json()).ok).toBe(true);

        const prep2 = await fetch(`${BASE_URL}/api/escrows/${id}/release/prepare`, { method: "POST", headers, body: JSON.stringify({ branch: "mutualRelease" }) });
        expect((await prep2.json()).ok).toBe(true);
    });

    it("should allow re-signing safely", async () => {
        const sign1 = await fetch(`${BASE_URL}/api/escrows/${id}/sign`, { method: "POST", headers, body: JSON.stringify({ role: "buyer" }) });
        expect((await sign1.json()).ok).toBe(true);

        const sign2 = await fetch(`${BASE_URL}/api/escrows/${id}/sign`, { method: "POST", headers, body: JSON.stringify({ role: "buyer" }) });
        expect((await sign2.json()).ok).toBe(true);
    });

    it("should reconcile multiple times safely", async () => {
        const rec1 = await fetch(`${BASE_URL}/api/escrows/${id}/reconcile`, { method: "POST", headers });
        expect((await rec1.json()).ok).toBe(true);
        const rec2 = await fetch(`${BASE_URL}/api/escrows/${id}/reconcile`, { method: "POST", headers });
        expect((await rec2.json()).ok).toBe(true);
    });
});
