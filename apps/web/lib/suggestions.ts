import { DESK_METRIC_KEYS, metricInfo, type DeskMetricKey, type ViewSpec } from '@desk/shared';

// Follow-up questions under the latest answer, chosen from what is on screen.
// Built here rather than by the model, so they cost nothing and don't change
// the desk_agent task.

const PEERS: Record<string, string[]> = {
  NVDA: ['AMD', 'AVGO'],
  AMD: ['NVDA', 'INTC'],
  MSFT: ['GOOGL', 'AMZN'],
  GOOGL: ['MSFT', 'META'],
  META: ['GOOGL', 'NFLX'],
  AAPL: ['MSFT', 'GOOGL'],
  AMZN: ['MSFT', 'WMT'],
};
const peersOf = (t: string) => PEERS[t] ?? (t === 'MSFT' ? ['AAPL', 'GOOGL'] : ['MSFT', 'AAPL']);
const label = (m: string) =>
  (DESK_METRIC_KEYS as string[]).includes(m) ? metricInfo(m as DeskMetricKey).label.toLowerCase() : m.replace(/_/g, ' ');

export function suggestions(view: ViewSpec | null, lastQuestion: string, latestQuarter: string | null): string[] {
  const q = latestQuarter ?? 'the latest quarter';
  let out: string[];
  switch (view?.view) {
    case 'quarter_overview': {
      const [a, b] = peersOf(view.ticker);
      out = [
        `What drove revenue growth in ${q}?`,
        'How did operating margin move across these quarters?',
        'Show cash from operations for each quarter',
        `Compare ${view.ticker} revenue with ${a} and ${b}`,
      ];
      break;
    }
    case 'metric_detail': {
      const [a, b] = peersOf(view.ticker);
      const other = view.metric === 'net_margin' ? 'gross margin' : 'net margin';
      out = [
        `Why did ${label(view.metric)} change in ${q}?`,
        `Show ${other} over the same quarters`,
        `Compare ${label(view.metric)} with ${a} and ${b}`,
        'What guidance did management give?',
      ];
      break;
    }
    case 'compare': {
      const [first] = view.tickers;
      out = [
        'Which grew fastest year on year?',
        `Compare their operating margins`,
        first ? `Get ${first}'s last four quarters` : "Get NVIDIA's last four quarters",
        'Compare net income for the same companies',
      ];
      break;
    }
    case 'filing_reader':
      out = ['What did management say drove results?', 'What guidance did they give?', 'What risks did they flag?'];
      break;
    default:
      out = ["Get NVIDIA's last four quarters", 'Compare NVIDIA, Microsoft and Apple revenue', "Load Microsoft's fiscal 2026 filings"];
  }
  const asked = lastQuestion.trim().toLowerCase();
  return out.filter((s) => s.toLowerCase() !== asked).slice(0, 4);
}
