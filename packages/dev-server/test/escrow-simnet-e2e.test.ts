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

describe("Simnet E2E Flow with Mining", () => {
    it("should complete e2e with manual minning triggers", async () => {
        // 1. Create
        const createRes = await fetch(`${BASE_URL}/api/escrows`, { method: "POST", headers, body: JSON.stringify(config) });
        const id = (await createRes.json()).data.id;

        // 2. Fund
        const fundRes = await fetch(`${BASE_URL}/api/escrows/${id}/fund`, { method: "POST", headers });
        expect((await fundRes.json()).ok).toBe(true);

        // 3. Prepare
        const prepRes = await fetch(`${BASE_URL}/api/escrows/${id}/release/prepare`, { method: "POST", headers, body: JSON.stringify({ branch: "mutualRelease" }) });
        expect((await prepRes.json()).ok).toBe(true);

        // 4. Sign
        await fetch(`${BASE_URL}/api/escrows/${id}/sign`, { method: "POST", headers, body: JSON.stringify({ role: "buyer" }) });
        await fetch(`${BASE_URL}/api/escrows/${id}/sign`, { method: "POST", headers, body: JSON.stringify({ role: "seller" }) });

        // 5. Release
        const relRes = await fetch(`${BASE_URL}/api/escrows/${id}/release`, { method: "POST", headers });
        const releaseData = await relRes.json();
        expect(releaseData.ok).toBe(true);

        // 6. Mine block
        const mineRes = await fetch(`${BASE_URL}/api/simnet/mine?blocks=1`, { method: "POST", headers });
        expect((await mineRes.json()).ok).toBe(true);

        // 7. Reconcile
        const recRes = await fetch(`${BASE_URL}/api/escrows/${id}/reconcile`, { method: "POST", headers });
        expect((await recRes.json()).ok).toBe(true);

        // 8. Check Final Status
        const finalRes = await fetch(`${BASE_URL}/api/escrows/${id}`, { headers });
        const finalData = await finalRes.json();
        expect(finalData.data.state).toBe("RELEASED");
        expect(finalData.data.release.status).toBe("confirmed");

    }, 120000);
});
