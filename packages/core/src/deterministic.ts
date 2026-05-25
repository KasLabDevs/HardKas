/**
 * Deterministic comparison utility for cross-platform string sorting.
 * Avoids localeCompare() which is dependent on the host machine's ICU version and OS locale.
 */
export function deterministicCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
