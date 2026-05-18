export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

export function formatPosition(value: number): string {
  return `${Math.round(value * 100)}%`;
}
