/** Integer fields the RPC expects as JSON numbers; bigint values above 2^53 are refused, not rounded. */
function toRpcNumber(value: unknown, field: string): number {
  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`RPC_SERIALIZATION_UNSAFE_INTEGER: ${field} ${value} exceeds 2^53`);
    }
    return Number(value);
  }
  return typeof value === "number" ? value : Number(value || 0);
}

function storageMassOf(txInner: any): number {
  const value = txInner.storageMass ?? txInner.mass;
  if (value === undefined || value === null) {
    throw new Error("RPC_STORAGE_MASS_MISSING: the serialized transaction carries no storageMass commitment");
  }
  return toRpcNumber(value, "storageMass");
}

/**
 * Maps a WASM transaction to the RPC shape. Accepts `tx.serializeToObject()`
 * (preferred: amounts stay exact bigints) or a JSON string.
 */
export function parseWasmTxToRpc(wasmTx: string | object, signedTx?: any, inputOverrides?: Record<number, { signatureScript: string }>, plan?: any): any {
  let parsed: any;
  if (typeof wasmTx === "string") {
    try {
      parsed = JSON.parse(wasmTx);
    } catch (e) {
      throw new Error("Failed to parse WASM transaction JSON: " + String(e));
    }
  } else {
    parsed = wasmTx;
  }

  // Handle both flattened `outputs` and wrapped `{ tx: { inner: ... } }` representations
  // Also handle another wrapping level sometimes seen in fixtures
  while (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }

  const txInner = parsed.outputs ? parsed : (parsed.tx ? parsed.tx.inner : parsed.inner);
  if (!txInner) throw new Error("Could not find inner tx data");

  const version = toRpcNumber(txInner.version || 0, "version");
  const numInputs = txInner.inputs ? txInner.inputs.length : 0;

  if (inputOverrides) {
    for (const idxStr of Object.keys(inputOverrides)) {
      const idx = parseInt(idxStr, 10);
      if (isNaN(idx) || idx < 0 || idx >= numInputs) {
        throw new Error(`INVALID_UNLOCKER_INPUT_INDEX: Unlocker provided for non-existent input index ${idxStr}`);
      }
    }
  }

  function toHex(arr: Uint8Array | number[]): string {
    if (!arr) return "";
    return Buffer.from(arr as any).toString("hex");
  }

  return {
    version: version,
    inputs: (txInner.inputs || []).map((i: any, idx: number) => {
      const isFlattened = !!i.previousOutpoint || !!i.transactionId;
      const prevOut = isFlattened ? (i.previousOutpoint || i) : i.inner.previousOutpoint.inner;
      const originalSigScript = isFlattened ? (i.signatureScript || "") : toHex(i.inner.signatureScript);
      const originalSigOpCount = isFlattened ? i.sigOpCount : i.inner.sigOpCount;
      const computeBudget = isFlattened ? i.computeBudget : i.inner.computeBudget;
      
      const override = inputOverrides ? inputOverrides[idx] : undefined;
      const finalSigScript = override ? override.signatureScript : originalSigScript;

      if (!finalSigScript || finalSigScript.length === 0 || !/^[0-9a-fA-F]+$/.test(finalSigScript)) {
        throw new Error(`INVALID_SIGNATURE_SCRIPT: Missing or invalid hex signature script at input ${idx}`);
      }

      const sigOpCount = version === 1 ? 0 : (originalSigOpCount !== undefined ? toRpcNumber(originalSigOpCount, "sigOpCount") : 1);
      
      if (version === 1 && sigOpCount !== 0) {
        throw new Error("INVALID_V1_SIG_OP_COUNT: V1 transactions must have sigOpCount = 0.");
      }
      
      const overrideBudget = plan?.computeBudget;
      const finalComputeBudget = overrideBudget !== undefined ? Number(overrideBudget) : toRpcNumber(computeBudget ?? 0, "computeBudget");

      return {
        previousOutpoint: {
          transactionId: prevOut.transactionId,
          index: toRpcNumber(prevOut.index ?? 0, "index")
        },
        signatureScript: finalSigScript,
        sequence: toRpcNumber(isFlattened ? (i.sequence || 0) : (i.inner.sequence || 0), "sequence"),
        sigOpCount: sigOpCount,
        computeBudget: finalComputeBudget
      };
    }),
    outputs: (txInner.outputs || []).map((o: any, idx: number) => {
      const isFlattened = !!o.scriptPublicKey || !!o.script_public_key || !!o.value || !!o.amount;
      const innerOut = isFlattened ? o : o.inner;
      const scriptObj = innerOut.scriptPublicKey || innerOut.script_public_key;

      const ret: any = {
        amount: (innerOut.value || innerOut.amount || 0).toString(),
        scriptPublicKey: {
          version: typeof scriptObj === 'string' ? parseInt(scriptObj.substring(0, 4), 16) || 0 : (scriptObj.version || 0),
          scriptPublicKey: typeof scriptObj === 'string' ? scriptObj.substring(4) : (scriptObj.scriptPublicKey || scriptObj.script || "")
        }
      };

      if (innerOut.covenant) {
        ret.covenant = {
          authorizingInput: innerOut.covenant.authorizingInput !== undefined ? innerOut.covenant.authorizingInput : 0,
          covenantId: typeof innerOut.covenant.covenantId === 'string' ? innerOut.covenant.covenantId : ""
        };
      } else if (signedTx && typeof signedTx.outputs === "function") {
        const outputs = signedTx.outputs();
        if (outputs && outputs[idx] && outputs[idx].covenant) {
          const cov = outputs[idx].covenant;
          ret.covenant = {
            authorizingInput: cov.authorizingInput !== undefined ? cov.authorizingInput : 0,
            covenantId: typeof cov.covenantId === 'string' ? cov.covenantId : cov.covenantId.toString()
          };
        }
      } else if (signedTx && signedTx.outputs && signedTx.outputs[idx] && signedTx.outputs[idx].covenant) {
        const cov = signedTx.outputs[idx].covenant;
        ret.covenant = {
          authorizingInput: cov.authorizingInput !== undefined ? cov.authorizingInput : 0,
          covenantId: typeof cov.covenantId === 'string' ? cov.covenantId : cov.covenantId.toString()
        };
      }
      return ret;
    }),
    lockTime: toRpcNumber(txInner.lockTime || 0, "lockTime"),
    subnetworkId: txInner.subnetworkId || "0000000000000000000000000000000000000000",
    gas: toRpcNumber(txInner.gas || 0, "gas"),
    // The transaction's storage mass commitment, under its Toccata name only. The
    // node refuses a `mass` that differs from `storageMass`, so the deprecated
    // field is read (older serializations) but never written.
    storageMass: storageMassOf(txInner),
    payload: txInner.payload && txInner.payload.length > 0 ? (typeof txInner.payload === 'string' ? txInner.payload : toHex(txInner.payload)) : ""
  };
}
