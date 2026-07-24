import { describe, it, expect, beforeAll } from "vitest";

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

describe("Resolution Matrix", () => {
    
    async function executeBranch(branch: string, signers: string[]) {
        const createRes = await fetch(`${BASE_URL}/api/escrows`, { method: "POST", headers, body: JSON.stringify(config) });
        const createData = await createRes.json();
        expect(createData.ok).toBe(true);
        const id = createData.data.id;

        const fundRes = await fetch(`${BASE_URL}/api/escrows/${id}/fund`, { method: "POST", headers });
        const fundData = await fundRes.json();
        expect(fundData.ok).toBe(true);
        
        // Prepare
        const prepRes = await fetch(`${BASE_URL}/api/escrows/${id}/release/prepare`, { method: "POST", headers, body: JSON.stringify({ branch }) });
        const prepData = await prepRes.json();
        expect(prepData.ok).toBe(true);

        // Sign
        for (const role of signers) {
            const signRes = await fetch(`${BASE_URL}/api/escrows/${id}/sign`, { method: "POST", headers, body: JSON.stringify({ role }) });
            expect((await signRes.json()).ok).toBe(true);
        }

        // Broadcast
        const relRes = await fetch(`${BASE_URL}/api/escrows/${id}/release`, { method: "POST", headers });
        const relData = await relRes.json();
        expect(relData.ok).toBe(true);

        // Verify status
        const getRes = await fetch(`${BASE_URL}/api/escrows/${id}`, { headers });
        const getData = await getRes.json();
        
        expect(getData.data.release).toBeDefined();
        // Since we didn't explicitly mine, it might be verification_timeout or confirmed if auto-mined
        expect(["verification_timeout", "confirmed"]).toContain(getData.data.release.status);
    }

    it("should execute Mutual Release (Buyer + Seller -> Buyer)", async () => {
        await executeBranch("mutualRelease", ["buyer", "seller"]);
    }, 60000);

    it("should execute Refund Buyer (Buyer + Arbiter -> Buyer)", async () => {
        await executeBranch("refundBuyer", ["buyer", "arbiter"]);
    }, 60000);

    it("should execute Release to Seller (Seller + Arbiter -> Seller)", async () => {
        await executeBranch("releaseToSeller", ["seller", "arbiter"]);
    }, 60000);

});
