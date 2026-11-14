import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookEvent {
    id: string;
    type: string;
    payload: any;
    timestamp: number;
}

export interface WebhookDeliveryResult {
    success: boolean;
    statusCode?: number;
    error?: string;
}

export interface WebhookTransport {
    send(url: string, event: WebhookEvent): Promise<WebhookDeliveryResult>;
}

export class MemoryWebhookTransport implements WebhookTransport {
    public delivered: Array<{url: string; event: WebhookEvent}> = [];

    async send(url: string, event: WebhookEvent): Promise<WebhookDeliveryResult> {
        this.delivered.push({ url, event });
        return { success: true, statusCode: 200 };
    }
}

/** The header that carries the delivery time (unix seconds) and the one that carries `sha256=<hex HMAC>`. */
export const WEBHOOK_TIMESTAMP_HEADER = "x-hardkas-webhook-timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "x-hardkas-webhook-signature";
/** How old a signed delivery the receiver accepts, by default (5 minutes): a replayed old delivery is refused. */
export const WEBHOOK_DEFAULT_TOLERANCE_SECONDS = 300;

export interface FetchWebhookTransportOptions {
    /**
     * When set, every delivery is signed: HMAC-SHA256 with this secret over `<timestamp>.<raw body>`, sent in
     * WEBHOOK_SIGNATURE_HEADER as `sha256=<hex>`, the timestamp in WEBHOOK_TIMESTAMP_HEADER. Unset (the default): the
     * JSON is posted unsigned, as before. Keep the secret out of the code (an environment variable).
     */
    secret?: string;
}

/** The signature of one delivery: hex HMAC-SHA256 of `<timestamp>.<raw body>` with the shared secret. */
export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
    return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * The RECEIVING side's check. Pass the raw request body exactly as received (before any JSON parsing) and the two
 * headers. It is true only when the timestamp is within `toleranceSeconds` of now and the signature matches, compared
 * in constant time (`timingSafeEqual`, never `===`). Reject the delivery otherwise; dedupe accepted ones by `event.id`.
 *
 *   // e.g. in a Fastify receiver, with the raw body kept (fastify-raw-body or a content-type parser that keeps it):
 *   const ok = verifyWebhookSignature({
 *       secret: process.env.WEBHOOK_SECRET!,
 *       rawBody: request.rawBody,
 *       timestamp: String(request.headers[WEBHOOK_TIMESTAMP_HEADER] ?? ""),
 *       signature: String(request.headers[WEBHOOK_SIGNATURE_HEADER] ?? "")
 *   });
 *   if (!ok) return reply.status(401).send({ error: "bad signature" });
 */
export function verifyWebhookSignature(input: {
    secret: string;
    rawBody: string;
    timestamp: string;
    signature: string;
    toleranceSeconds?: number;
    nowSeconds?: number;
}): boolean {
    const ts = Number(input.timestamp);
    if (!/^\d+$/.test(input.timestamp) || !Number.isSafeInteger(ts)) return false;
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > (input.toleranceSeconds ?? WEBHOOK_DEFAULT_TOLERANCE_SECONDS)) return false;
    const given = input.signature.startsWith("sha256=") ? input.signature.slice("sha256=".length) : "";
    if (!/^[0-9a-f]{64}$/i.test(given)) return false;
    const expected = Buffer.from(signWebhookPayload(input.secret, input.timestamp, input.rawBody), "hex");
    const actual = Buffer.from(given, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class FetchWebhookTransport implements WebhookTransport {
    constructor(private readonly options: FetchWebhookTransportOptions = {}) {}

    async send(url: string, event: WebhookEvent): Promise<WebhookDeliveryResult> {
        try {
            const body = JSON.stringify(event);
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (this.options.secret) {
                // G6 (notes cross-check, 16-accepting-payments): signed deliveries — a receiver can tell them from forgeries
                const timestamp = String(Math.floor(Date.now() / 1000));
                headers[WEBHOOK_TIMESTAMP_HEADER] = timestamp;
                headers[WEBHOOK_SIGNATURE_HEADER] = `sha256=${signWebhookPayload(this.options.secret, timestamp, body)}`;
            }
            const response = await fetch(url, {
                method: "POST",
                headers,
                body
            });
            return {
                success: response.ok,
                statusCode: response.status
            };
        } catch (err: any) {
            return {
                success: false,
                error: err.message
            };
        }
    }
}
