export function redactSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 10) {
    return "***";
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
