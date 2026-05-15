import type { LocalnetState, LocalnetUtxo } from "./types";

export interface FundAddressInput {
  address: string;
  amountSompi: bigint;
}

export function fundAddress(
  state: LocalnetState,
  input: FundAddressInput
): LocalnetState {
  if (input.amountSompi <= 0n) {
    throw new Error("Faucet amount must be positive.");
  }

  const nextDaaScore = (BigInt(state.daaScore) + 1n).toString();
  
  const newUtxo: LocalnetUtxo = {
    id: `faucet:${input.address.slice(-8)}:${nextDaaScore}:0`,
    address: input.address,
    amountSompi: input.amountSompi.toString(),
    spent: false,
    createdAtDaaScore: nextDaaScore
  };

  return {
    ...state,
    daaScore: nextDaaScore,
    utxos: [...state.utxos, newUtxo]
  };
}
