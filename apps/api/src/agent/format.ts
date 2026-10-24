/** Formats raw XBRL units for people (and for the agent, which must not do arithmetic). */
export function formatValue(value: number | null, unit: string): string {
  if (value === null) return 'n/a';
  switch (unit) {
    case 'USD':
      return money(value);
    case 'USD/share':
    case 'USD/shares':
      return `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`;
    case 'shares':
      return `${scaled(value)} shares`;
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    default:
      return String(value);
  }
}

export function formatChange(fraction: number | null): string | null {
  if (fraction === null || !Number.isFinite(fraction)) return null;
  return `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`;
}

function money(v: number): string {
  return `${v < 0 ? '-' : ''}$${scaled(Math.abs(v))}`;
}

function scaled(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
