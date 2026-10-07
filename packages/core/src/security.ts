/**
 * Redacts sensitive information from strings and objects recursively.
 * Masks Kaspa private keys (64 hex chars), mnemonics and the credentials of URLs.
 *
 * EVIDENCE-TRUST-1 (D8): a safety net for FREE TEXT only (error messages, warnings, stack traces). A 64-hex value has
 * the shape of a private key but also of every content hash and txId, so structured and identity output (titles, fields,
 * JSON) never goes through this function; it never decides identity, equality, verification or replay either.
 */
export function maskSecrets(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Credentials carried by URLs (userinfo, secret-named query parameters)
    let redacted = redactUrlCredentialsInText(data);

    // Mask private keys (64 hex chars)
    redacted = redacted.replace(/\b[0-9a-fA-F]{64}\b/g, (match) => {
      return `${match.slice(0, 6)}...${match.slice(-4)} [REDACTED]`;
    });

    // Mask mnemonics (rough approximation for BIP39 - long series of words)
    // This is a safety net, not a perfect detector.
    redacted = redacted.replace(
      /\b([a-z]{3,10}\s+){11,23}[a-z]{3,10}\b/g,
      "[MNEMONIC REDACTED]"
    );

    return redacted;
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSecrets(item));
  }

  if (typeof data === "object") {
    const redactedObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // Redact common sensitive keys immediately
        if (
          key.toLowerCase().includes("secret") ||
          key.toLowerCase().includes("privatekey") ||
          key.toLowerCase().includes("mnemonic") ||
          key.toLowerCase().includes("password")
        ) {
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
 * EVIDENCE-DIFF-REDACTION-1: the field names that hold secret material in HardKAS structures, by exact name (any
 * case), never by the shape of a value. Structured evidence uses this list to decide what it may record; the shape-based
 * `maskSecrets` above stays a safety net for free text (messages, logs, stack traces) and never decides equality.
 */
const SECRET_FIELD_NAMES: ReadonlySet<string> = new Set([
  "privatekey",
  "privatekeyhex",
  "privatekeywif",
  "mnemonic",
  "seed",
  "seedphrase",
  "password",
  "passphrase",
  "keystorepassword",
  "secret",
  "secretkey",
  "apikey",
  "token",
  "accesstoken",
  "authtoken"
]);

/** Whether a field of that name holds secret material (see SECRET_FIELD_NAMES). */
export function isSecretFieldName(name: string): boolean {
  return SECRET_FIELD_NAMES.has(name.toLowerCase());
}

/** A name compared without case and without "_" or "-": `access_token` = `accessToken` = `ACCESS-TOKEN`. */
const normalizeSecretName = (name: string) => name.toLowerCase().replace(/[_-]/g, "");

/**
 * EVIDENCE-TRUST-1 (D6): the query-parameter names that carry a credential in a URL, compared without case and without
 * "_" / "-". The structured secret field names count too. Decided by NAME only, never by the shape of a value: a
 * credential embedded in an opaque path segment (`/v3/<key>`) cannot be recognised without knowing the provider, and is
 * kept as it is.
 */
const SECRET_URL_PARAM_NAMES: ReadonlySet<string> = new Set([
  "token",
  "accesstoken",
  "authtoken",
  "apikey",
  "key",
  "auth",
  "sig",
  "signature",
  "password",
  "passphrase",
  "secret",
  "secretkey",
  ...SECRET_FIELD_NAMES
]);

/** Whether a URL query parameter of that name carries a credential (see SECRET_URL_PARAM_NAMES). */
export function isSecretUrlParamName(name: string): boolean {
  return SECRET_URL_PARAM_NAMES.has(normalizeSecretName(name));
}

/** What replaces the value of a secret query parameter: URL-safe, so the redacted URL stays a valid URL. */
export const URL_SECRET_MARKER = "REDACTED";

/** `k=v&k2=v2` with the value of every secret-named parameter replaced by the marker; anything else byte for byte. */
function redactParams(params: string): string {
  return params
    .split("&")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq < 0) return part;
      const rawName = part.slice(0, eq);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, " "));
      } catch {
        // an undecodable name is compared as written
      }
      return isSecretUrlParamName(name) ? `${rawName}=${URL_SECRET_MARKER}` : part;
    })
    .join("&");
}

/**
 * EVIDENCE-TRUST-1 (D5): a URL without its credentials — the userinfo (`user:password@`) removed and the value of every
 * secret-named query parameter (D6) replaced by the marker; the scheme, host, port, path, public query parameters and
 * their order are kept exactly. A URL with nothing to redact is returned unchanged (byte for byte); a value that is not a
 * URL is returned as it is. A credential inside an opaque path segment is not recognisable and is kept.
 */
export function redactUrlCredentials(url: string): string {
  if (typeof url !== "string" || url === "") return url;
  const hashAt = url.indexOf("#");
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : undefined;
  const queryAt = beforeHash.indexOf("?");
  let head = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const query = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : undefined;

  // userinfo: everything up to the LAST "@" of the authority (a raw "@" inside a password stays inside what is removed)
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(head);
  const authorityStart = scheme ? scheme[0].length : 0;
  const rest = head.slice(authorityStart);
  const slash = rest.indexOf("/");
  const authority = slash >= 0 ? rest.slice(0, slash) : rest;
  const at = authority.lastIndexOf("@");
  if (at >= 0 && (scheme || /^[^\s/@]+:[^\s/@]*@[^\s/@]+$/.test(authority))) {
    head = head.slice(0, authorityStart) + rest.slice(at + 1);
  }

  return (
    head +
    (query === undefined ? "" : `?${redactParams(query)}`) +
    (fragment === undefined ? "" : `#${fragment.includes("=") ? redactParams(fragment) : fragment}`)
  );
}

/**
 * EVIDENCE-TRUST-1: the credentials of every URL inside free text (a message, a log line) redacted as
 * `redactUrlCredentials` does — scheme URLs, and bare request paths with a query (`GET /api/stream?token=…`).
 * Punctuation that ends a sentence after a URL is kept outside it.
 */
export function redactUrlCredentialsInText(text: string): string {
  if (typeof text !== "string" || text === "") return text;
  const withUrls = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`]+/gi, (match) => {
    const trail = /[.,;:!?)\]}]+$/.exec(match)?.[0] ?? "";
    const core = trail ? match.slice(0, -trail.length) : match;
    return redactUrlCredentials(core) + trail;
  });
  return withUrls.replace(
    /([?&])([^=&#\s"'<>`?]+)=([^&#\s"'<>`]*)/g,
    (whole, sep: string, rawName: string, rawValue: string) => {
      let name = rawName;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, " "));
      } catch {
        // compared as written
      }
      if (!isSecretUrlParamName(name)) return whole;
      const trail = /[.,;:!?)\]}]+$/.exec(rawValue)?.[0] ?? ""; // a sentence's punctuation stays outside the value
      return `${sep}${rawName}=${URL_SECRET_MARKER}${trail}`;
    }
  );
}

/**
 * EVIDENCE-TRUST-1 (D9): a copy of a structure without its secret material, for the inspection, listing and
 * configuration commands. A field whose name (compared without case, "_" or "-") is a secret field name and whose value
 * is material (a non-empty string, or a list/object of them) is dropped (`"drop"`) or replaced by "[REDACTED]"
 * (`"mask"`); a number or boolean under such a name (a test `seed: 42`) is not secret material and stays. Every string
 * elsewhere has its URL credentials redacted. Commands whose explicit contract is to reveal or export a secret do not use
 * it.
 */
export function redactSecretFields<T>(value: T, mode: "mask" | "drop" = "mask"): T {
  const isMaterial = (v: unknown) => (typeof v === "string" ? v !== "" : v !== null && typeof v === "object");
  const visit = (v: any): any => {
    if (typeof v === "string") return redactUrlCredentialsInText(v);
    if (Array.isArray(v)) return v.map(visit);
    if (v === null || typeof v !== "object") return v;
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(v)) {
      if (SECRET_FIELD_NAMES.has(normalizeSecretName(key)) && isMaterial(item)) {
        if (mode === "mask") out[key] = "[REDACTED]";
        continue;
      }
      out[key] = visit(item);
    }
    return out;
  };
  return visit(value);
}

/**
 * Legacy single-value redaction for backward compatibility.
 */
export function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
