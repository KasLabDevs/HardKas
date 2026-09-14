// Internal: not re-exported from index.ts.

/**
 * Identifiers that become part of a file name. They come from artifact
 * content, which may be hostile, so anything that could name a path
 * (separators, `..`, drive letters) is refused rather than normalised.
 */
export const SAFE_FILE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/;

export function codedError(code: string, message: string): Error {
  const err = new Error(message);
  (err as any).code = code;
  return err;
}

/** Returns `value` if it is safe to embed in a file name, otherwise throws ARTIFACT_ID_INVALID. */
export function assertSafeFileId(field: string, value: unknown): string {
  if (typeof value === "string" && SAFE_FILE_ID.test(value)) return value;
  const shown = typeof value === "string" ? JSON.stringify(value.slice(0, 80)) : typeof value;
  throw codedError(
    "ARTIFACT_ID_INVALID",
    `Invalid ${field} ${shown}: artifact identifiers must match ${SAFE_FILE_ID}`
  );
}

/** The schema's second segment when it is file-name safe, otherwise `fallback`. */
export function schemaFilePrefix(schema: unknown, segment: number, fallback: string): string {
  if (typeof schema !== "string") return fallback;
  const parts = schema.split(".");
  const value = segment < 0 ? parts[parts.length + segment] : parts[segment];
  return value && SAFE_FILE_ID.test(value) ? value : fallback;
}
