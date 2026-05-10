export function formatWeiAsEtherLike(valueWei: bigint, symbol: string, decimals: number = 18): string {
  const s = valueWei.toString().padStart(decimals + 1, "0");
  const pos = s.length - decimals;
  const intPart = s.substring(0, pos);
  const fracPart = s.substring(pos);
  return `${intPart}.${fracPart} ${symbol}`;
}

export function toHexQuantity(value: bigint | string | number): string {
  const big = BigInt(value);
  return "0x" + big.toString(16);
}
