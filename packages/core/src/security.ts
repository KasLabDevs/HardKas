/**
 * Redacts sensitive information from strings and objects recursively.
 * Masks Kaspa private keys (64 hex chars) and mnemonics.
 */
export function maskSecrets(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Mask private keys (64 hex chars)
    let redacted = data.replace(/\b[0-9a-fA-F]{64}\b/g, (match) => {
      return `${match.slice(0, 6)}...${match.slice(-4)} [REDACTED]`;
    });

    // Mask mnemonics (rough approximation for BIP39 - long series of words)
    // This is a safety net, not a perfect detector.
    redacted = redacted.replace(/\b([a-z]{3,10}\s+){11,23}[a-z]{3,10}\b/g, "[MNEMONIC REDACTED]");

    return redacted;
  }

  if (Array.isArray(data)) {
    return data.map(item => maskSecrets(item));
  }

  if (typeof data === "object") {
    const redactedObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // Redact common sensitive keys immediately
        if (key.toLowerCase().includes("secret") || 
            key.toLowerCase().includes("privatekey") || 
            key.toLowerCase().includes("mnemonic") ||
            key.toLowerCase().includes("password")) {
          redactedObj[key] = "[REDACTED]";
        } else {
          redactedObj[key] = maskSecrets(data[key]);
        }
      }
    }
    return redactedObj;
  }

  return data;
}

/**
 * Legacy single-value redaction for backward compatibility.
 */
export function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
