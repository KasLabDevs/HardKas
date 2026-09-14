/**
 * Toccata JSON RPC mass field.
 *
 * rusty-kaspa renamed the transaction's storage mass commitment from `mass` to
 * `storageMass`. Its JSON accepts either, refuses both when they differ, and
 * refuses neither (reported only as an opaque "request deserialization error").
 * New integrations write `storageMass` (docs/toccata-guide.md).
 *
 * So HardKAS writes `storageMass` only. A legacy `mass` supplied by the caller
 * is carried over under the new name, never synthesized; a conflict or a
 * missing commitment is refused here with a precise error instead.
 */
export function normalizeRpcStorageMass(tx: Record<string, unknown>): void {
  const current = tx.storageMass ?? tx.storage_mass;
  const legacy = tx.mass;
  const asBigInt = (v: unknown, field: string): bigint => {
    try {
      return BigInt(v as any);
    } catch {
      throw rpcMassError("RPC_STORAGE_MASS_INVALID", `${field} ${String(v)} is not an integer`);
    }
  };
  if (current !== undefined && legacy !== undefined && asBigInt(current, "storageMass") !== asBigInt(legacy, "mass")) {
    throw rpcMassError(
      "RPC_STORAGE_MASS_CONFLICT",
      `transaction carries storageMass ${String(current)} and legacy mass ${String(legacy)}; the node refuses differing values`
    );
  }
  const value = current ?? legacy;
  if (value === undefined) {
    throw rpcMassError(
      "RPC_STORAGE_MASS_MISSING",
      "transaction has no storageMass commitment; build it with the SDK (Transaction.storageMass) before submitting"
    );
  }
  const n = asBigInt(value, current !== undefined ? "storageMass" : "mass");
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw rpcMassError("RPC_STORAGE_MASS_INVALID", `storageMass ${n} is out of range`);
  }
  delete tx.mass;
  delete tx.storage_mass;
  tx.storageMass = Number(n);
}

function rpcMassError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}
