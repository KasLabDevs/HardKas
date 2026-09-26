// -----------------------------------------------------------------------------
// Wave 10 · RECEIPT-1 · Typed receipt-lookup errors.
//
// Two distinct conditions, two distinct codes:
//
//   RECEIPT_NOT_FOUND
//     Zero canonical L1 receipt artifacts in the workspace carry a `.txId`
//     field that string-equals the requested value. This is the honest
//     answer to "no evidence for this txId here" — it says nothing about
//     whether the transaction exists on-chain.
//
//   RECEIPT_AMBIGUOUS_CONFLICT
//     More than one canonical L1 receipt artifact carries the requested
//     `.txId` AND at least two of them disagree structurally (they do NOT
//     share the same `.contentHash`, or `.contentHash` is absent from one
//     or more). Duplicate copies of the SAME evidence (identical, non-empty
//     `.contentHash` across every match) are NOT ambiguous — the resolver
//     returns a single representative. Missing or empty `.contentHash` on
//     any match forces ambiguity classification so that two genuinely
//     distinct artifacts can never be collapsed under
//     `undefined === undefined`.
//
// Following the Wave 5 (ArtifactHandleError) / Wave 6 (LineageError)
// pattern: small typed class, machine-readable code, optional context.
// -----------------------------------------------------------------------------

export type ReceiptLookupErrorCode =
  | "RECEIPT_NOT_FOUND"
  | "RECEIPT_AMBIGUOUS_CONFLICT"
  // Wave 1.2 · IC-5′.4: a receipt that claims the txId but does not verify fails the lookup.
  | "CANDIDATE_INVALID";

export class ReceiptLookupError extends Error {
  readonly code: ReceiptLookupErrorCode;
  readonly context?: Record<string, string>;

  constructor(
    code: ReceiptLookupErrorCode,
    message: string,
    context?: Record<string, string>
  ) {
    super(message);
    this.name = "ReceiptLookupError";
    this.code = code;
    if (context !== undefined) this.context = context;
  }
}
