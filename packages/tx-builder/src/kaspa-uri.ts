/**
 * KaspaURIBuilder — Builder Lab 02, Friction #02
 * 
 * Builds standard Kaspa payment URIs for wallet interoperability.
 * Uses safe integer arithmetic for sompi→KAS conversion.
 * 
 * Format: kaspa:<address>?amount=<KAS>&label=<text>&message=<text>
 * 
 * The amount in the URI is expressed in KAS (human-readable)
 * but the input is always in sompi (safe, no floats).
 */

const SOMPI_PER_KAS = 100_000_000n;

export interface KaspaUriRequest {
    readonly address: string;
    readonly amountSompi: bigint;
    readonly label?: string;
    readonly message?: string;
}

export interface KaspaUriResult {
    readonly uri: string;
    readonly address: string;
    readonly amountSompi: bigint;
    readonly amountKasDisplay: string;
    readonly params: Record<string, string>;
    readonly claims: {
        readonly standardFormat: false; // No official Kaspa URI standard yet
    };
}

/**
 * Convert sompi to a KAS display string using pure integer arithmetic.
 * No floats. No Number(). No precision loss.
 * 
 * Examples:
 *   100_000_000n → "1"
 *   150_000_000n → "1.5"
 *   1_000n       → "0.00001"
 *   0n           → "0"
 */
export function sompiToKasDisplay(sompi: bigint): string {
    if (sompi < 0n) {
        throw new Error("KASPA_URI_INVALID_AMOUNT: Negative amounts are not allowed.");
    }

    const whole = sompi / SOMPI_PER_KAS;
    const remainder = sompi % SOMPI_PER_KAS;

    if (remainder === 0n) {
        return whole.toString();
    }

    // Pad remainder to 8 digits, then strip trailing zeros
    let fracStr = remainder.toString().padStart(8, "0");
    fracStr = fracStr.replace(/0+$/, "");

    return `${whole}.${fracStr}`;
}

export function buildKaspaUri(request: KaspaUriRequest): KaspaUriResult {
    if (!request.address || request.address.trim() === "") {
        throw new Error("KASPA_URI_INVALID_ADDRESS: Address is required.");
    }

    if (request.amountSompi < 0n) {
        throw new Error("KASPA_URI_INVALID_AMOUNT: Negative amounts are not allowed.");
    }

    const amountKasDisplay = sompiToKasDisplay(request.amountSompi);

    const params: Record<string, string> = {};
    const queryParts: string[] = [];

    if (request.amountSompi > 0n) {
        params["amount"] = amountKasDisplay;
        queryParts.push(`amount=${amountKasDisplay}`);
    }

    if (request.label) {
        params["label"] = request.label;
        queryParts.push(`label=${encodeURIComponent(request.label)}`);
    }

    if (request.message) {
        params["message"] = request.message;
        queryParts.push(`message=${encodeURIComponent(request.message)}`);
    }

    const query = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    const uri = `kaspa:${request.address}${query}`;

    return {
        uri,
        address: request.address,
        amountSompi: request.amountSompi,
        amountKasDisplay,
        params,
        claims: {
            standardFormat: false // No official Kaspa URI BIP yet
        }
    };
}
