import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WalletQuery } from "@hardkas/query";
import {
  FetchWebhookTransport,
  MemoryWebhookTransport,
  signWebhookPayload,
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER
} from "../templates/payment-service/src/domain/WebhookTransport.js";
import { PaymentService } from "../templates/payment-service/src/domain/PaymentService.js";
import { CheckoutService } from "../templates/merchant-checkout/src/domain/CheckoutService.js";

// G6 (notes cross-check, 16-accepting-payments) · the payment templates `hardkas create` scaffolds:
//  - the receipt artifact recorded `amountFoundSompi: invoice.amountSompi`, not what the check found (an overpayment
//    was never recorded);
//  - the webhook was unsigned JSON. Signing is optional (off by default) and the receiver's constant-time check ships
//    with the template.

const tmpDirs: string[] = [];
const tmp = (prefix: string) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
};
const originalCwd = process.cwd();
afterEach(() => {
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function queryOver(utxosFor: (address: string) => any[]) {
  return new WalletQuery({
    provider: {
      source: "mock",
      getBalances: async () => ({}),
      getUtxos: async (addresses: string[]) => Object.fromEntries(addresses.map((a) => [a, utxosFor(a)])),
      getHistory: async () => ({ items: [] })
    }
  });
}

describe("G6 · payment-service template: the receipt records what was found", () => {
  it("an overpayment is recorded as found; a covenant-bound coin at the address is not counted", async () => {
    const artifacts = tmp("hk-g6-ps-");
    const paid = 250_000_000n;
    const service = new PaymentService(
      queryOver(() => [
        { transactionId: "tx-pay", outputIndex: 0, amountSompi: paid, scriptPublicKey: "", confirmations: 1_000_000 },
        { transactionId: "tx-cov", outputIndex: 0, amountSompi: 900_000_000n, scriptPublicKey: "", covenantId: "ab".repeat(32), confirmations: 1_000_000 }
      ]),
      new MemoryWebhookTransport(),
      artifacts
    );
    service.registerMerchant("g6-merchant");
    const invoice = await service.createInvoice({ merchantId: "g6-merchant", amountSompi: 100_000_000n, memo: "g6" });
    const after = await service.checkPayment(invoice.id);
    expect(after.status).toBe("confirmed");
    expect(after.amountFoundSompi).toBe(paid.toString());
    const receipt = JSON.parse(fs.readFileSync(path.join(artifacts, `payment-receipt-${invoice.id}.json`), "utf-8"));
    expect(receipt.expectedAmountSompi).toBe("100000000");
    expect(receipt.amountFoundSompi).toBe(paid.toString()); // it was "100000000" (the invoice amount)
    expect(receipt.txId).toBe("tx-pay");
  });
});

describe("G6 · merchant-checkout template: markPaid records what was found", () => {
  it("checkPayment passes the found amount to the receipt; markPaid without it is refused", async () => {
    const cwd = tmp("hk-g6-mc-");
    process.chdir(cwd); // markPaid writes ./artifacts
    const service = new CheckoutService();
    service.registerMerchant("g6-checkout");
    const invoice = await service.createInvoice({ merchantId: "g6-checkout", amountSompi: 100_000_000n, memo: "g6" });
    await expect(service.markPaid(invoice.id, "tx-manual", 1_000_000)).rejects.toThrow(/amountFoundSompi/);
    (service as any).queryEngine = queryOver(() => [
      { transactionId: "tx-over", outputIndex: 2, amountSompi: 300_000_000n, scriptPublicKey: "", confirmations: 1_000_000 }
    ]);
    const after = await service.checkPayment(invoice.id);
    expect(after.status).toBe("confirmed");
    expect(after.amountFoundSompi).toBe("300000000");
    const receipt = JSON.parse(fs.readFileSync(path.join(cwd, "artifacts", `payment-receipt-${invoice.id}.json`), "utf-8"));
    expect(receipt.amountFoundSompi).toBe("300000000");
    expect(receipt.txId).toBe("tx-over");
  });
});

describe("G6 · payment-service template: optional signed webhooks", () => {
  const event = { id: "evt-1", type: "invoice.paid", payload: { invoiceId: "i", txId: "t", amountSompi: "1" }, timestamp: 1 };

  function stubFetch() {
    const calls: Array<{ url: string; init: any }> = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: true, status: 200 } as any;
    });
    return calls;
  }

  it("without a secret nothing changes: the JSON is posted with no signature headers", async () => {
    const calls = stubFetch();
    const result = await new FetchWebhookTransport().send("http://127.0.0.1:9/hook", event);
    expect(result).toEqual({ success: true, statusCode: 200 });
    expect(calls[0]!.init.headers).toEqual({ "Content-Type": "application/json" });
    expect(calls[0]!.init.body).toBe(JSON.stringify(event));
  });

  it("with a secret: HMAC-SHA256 over `<timestamp>.<body>` and a timestamp; the receiver's check accepts it", async () => {
    const calls = stubFetch();
    const secret = "test-webhook-secret";
    await new FetchWebhookTransport({ secret }).send("http://127.0.0.1:9/hook", event);
    const { headers, body } = calls[0]!.init;
    const timestamp = headers[WEBHOOK_TIMESTAMP_HEADER];
    const signature = headers[WEBHOOK_SIGNATURE_HEADER];
    expect(timestamp).toMatch(/^\d+$/);
    expect(signature).toBe(`sha256=${signWebhookPayload(secret, timestamp, body)}`);
    expect(verifyWebhookSignature({ secret, rawBody: body, timestamp, signature })).toBe(true);
  });

  it("the receiver's check refuses a wrong secret, a changed body, an old timestamp and a malformed signature", () => {
    const secret = "test-webhook-secret";
    const body = JSON.stringify(event);
    const now = 1_800_000_000;
    const timestamp = String(now);
    const signature = `sha256=${signWebhookPayload(secret, timestamp, body)}`;
    expect(verifyWebhookSignature({ secret, rawBody: body, timestamp, signature, nowSeconds: now })).toBe(true);
    expect(verifyWebhookSignature({ secret: "other", rawBody: body, timestamp, signature, nowSeconds: now })).toBe(false);
    expect(verifyWebhookSignature({ secret, rawBody: body.replace('"1"', '"2"'), timestamp, signature, nowSeconds: now })).toBe(false);
    expect(verifyWebhookSignature({ secret, rawBody: body, timestamp, signature, nowSeconds: now + 301 })).toBe(false);
    expect(verifyWebhookSignature({ secret, rawBody: body, timestamp, signature: signature.slice(0, -2), nowSeconds: now })).toBe(false);
    expect(verifyWebhookSignature({ secret, rawBody: body, timestamp, signature: signature.replace("sha256=", ""), nowSeconds: now })).toBe(false);
    expect(verifyWebhookSignature({ secret, rawBody: body, timestamp: "12a", signature, nowSeconds: now })).toBe(false);
  });
});
