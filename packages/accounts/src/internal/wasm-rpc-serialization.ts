export function parseWasmTxToRpc(wasmTxStr: string, signedTx?: any, inputOverrides?: Record<number, { signatureScript: string }>, plan?: any): any {
  let parsed: any;
  try {
    parsed = JSON.parse(wasmTxStr);
  } catch (e) {
    throw new Error("Failed to parse WASM transaction JSON: " + String(e));
  }

  // Handle both flattened `outputs` and wrapped `{ tx: { inner: ... } }` representations
  // Also handle another wrapping level sometimes seen in fixtures
  while (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }

  const txInner = parsed.outputs ? parsed : (parsed.tx ? parsed.tx.inner : parsed.inner);
  if (!txInner) throw new Error("Could not find inner tx data");

  const version = txInner.version || 0;
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
      const isFlattened = !!txInner.outputs || !!i.previousOutpoint || !!i.transactionId;
      const prevOut = isFlattened ? (i.previousOutpoint || i) : i.inner.previousOutpoint.inner;
      const originalSigScript = isFlattened ? (i.signatureScript || "") : toHex(i.inner.signatureScript);
      const originalSigOpCount = isFlattened ? i.sigOpCount : i.inner.sigOpCount;
      const computeBudget = isFlattened ? i.computeBudget : i.inner.computeBudget;
      
      const override = inputOverrides ? inputOverrides[idx] : undefined;
      const finalSigScript = override ? override.signatureScript : originalSigScript;

      if (!finalSigScript || finalSigScript.length === 0 || !/^[0-9a-fA-F]+$/.test(finalSigScript)) {
        throw new Error(`INVALID_SIGNATURE_SCRIPT: Missing or invalid hex signature script at input ${idx}`);
      }

      const sigOpCount = version === 1 ? 0 : (originalSigOpCount !== undefined ? originalSigOpCount : 1);
      
      if (version === 1 && sigOpCount !== 0) {
        throw new Error("INVALID_V1_SIG_OP_COUNT: V1 transactions must have sigOpCount = 0.");
      }
      
      const overrideBudget = plan?.computeBudget;
      const finalComputeBudget = overrideBudget !== undefined ? Number(overrideBudget) : ((computeBudget !== undefined && computeBudget !== 0) ? computeBudget : 0);

      return {
        previousOutpoint: {
          transactionId: prevOut.transactionId || prevOut.transactionId,
          index: prevOut.index || prevOut.index
        },
        signatureScript: finalSigScript,
        sequence: isFlattened ? (i.sequence || 0) : (i.inner.sequence || 0),
        sigOpCount: sigOpCount,
        computeBudget: finalComputeBudget
      };
    }),
    outputs: (txInner.outputs || []).map((o: any, idx: number) => {
      const isFlattened = !!txInner.outputs || !!o.scriptPublicKey || !!o.value || !!o.amount;
      const innerOut = isFlattened ? o : o.inner;
      const scriptObj = innerOut.scriptPublicKey;

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
    lockTime: txInner.lockTime || 0,
    subnetworkId: txInner.subnetworkId || "0000000000000000000000000000000000000000",
    gas: txInner.gas || 0,
    mass: txInner.mass || 0,
    storageMass: txInner.storageMass || 0,
    payload: txInner.payload && txInner.payload.length > 0 ? (typeof txInner.payload === 'string' ? txInner.payload : toHex(txInner.payload)) : ""
  };
}
