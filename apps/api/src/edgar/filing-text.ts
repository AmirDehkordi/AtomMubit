// Turning filing HTML into passages, and ranking passages for a question.
// Pure functions, no I/O.

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  bull: '•',
};

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Readable lines from filing HTML: paragraphs as lines, table rows as "cell | cell | cell". */
export function htmlToPassages(html: string): string[] {
  const text = decode(
    html
      .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, ' ')
      .replace(/<(head|script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t ]+/g, ' ')
        .replace(/(\s*\|\s*)+/g, ' | ')
        .replace(/^\s*\|\s*|\s*\|\s*$/g, '')
        .trim(),
    )
    .filter((line) => line.length >= 40 && /[a-z]/i.test(line));
}

const STOP = new Set(
  'a an and are as at be by did do does for from had has have how in is it its of on or our the their they this to was were what when where which who why will with did about across over last latest quarter quarters company management say said'.split(
    ' ',
  ),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

export interface Ranked {
  index: number;
  score: number;
}

/**
 * BM25 over the passages, with boosts for the kind of answer the question wants:
 * explanations ("driven by", "due to") for why-questions, outlook language for guidance.
 */
export function rankPassages(passages: string[], query: string, limit: number): Ranked[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const docs = passages.map((p) => tokens(p));
  const avg = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length);
  const df = new Map(q.map((t) => [t, docs.filter((d) => d.some((w) => w.startsWith(t))).length]));
  const why = /\b(why|drove|driv|reason|because|cause|explain)/i.test(query);
  const outlook = /\b(guid|outlook|expect|next quarter|forecast|forward)/i.test(query);
  const k1 = 1.2;
  const b = 0.75;

  return docs
    .map((d, index) => {
      let score = 0;
      for (const t of q) {
        const tf = d.filter((w) => w.startsWith(t)).length;
        if (!tf) continue;
        const idf = Math.log(1 + (docs.length - df.get(t)! + 0.5) / (df.get(t)! + 0.5));
        score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avg));
      }
      const text = passages[index]!;
      if (score > 0 && why && /(driven by|due to|primarily|reflect|attributable|led by|increase in)/i.test(text)) score *= 1.6;
      if (score > 0 && outlook && /(outlook|expect|anticipate|is expected to|guidance|we see)/i.test(text)) score *= 1.8;
      if (text.length > 1800) score *= 0.7;
      return { index, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
