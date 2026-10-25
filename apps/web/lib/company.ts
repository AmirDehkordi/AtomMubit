// SEC names are in capitals (NVIDIA CORP). The companies the demo uses get their usual names;
// anything else loses the legal suffix and is put in title case.
const NAMES: Record<string, string> = {
  NVDA: 'NVIDIA', MSFT: 'Microsoft', AAPL: 'Apple', AMD: 'AMD', GOOGL: 'Alphabet', GOOG: 'Alphabet', META: 'Meta',
  AMZN: 'Amazon', AVGO: 'Broadcom', INTC: 'Intel', NFLX: 'Netflix', WMT: 'Walmart', TSLA: 'Tesla',
};

export function companyName(ticker: string, secName?: string): string {
  if (NAMES[ticker]) return NAMES[ticker]!;
  const base = (secName ?? '').replace(/[,.]?\s+(CORP(ORATION)?|INC|CO|LTD|PLC|HOLDINGS|GROUP)\.?(\s*\/\w+\/)?$/i, '').trim();
  return base ? base.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : ticker;
}
