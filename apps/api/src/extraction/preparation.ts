/** Prepared offsets refer to this exact text, in JavaScript UTF-16 code units. */
export interface PreparedSection {
  id: string; documentId: string; ordinal: number; item: string; title: string;
  kind: 'text' | 'table'; text: string; charCount: number; page: number | null; sourceUrl: string | null;
}
export interface PrepareDocumentInput {
  runId: string; documentId: string; content: string; format: 'html' | 'text'; sourceUrl?: string;
}
function decode(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', minus: '−', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const value = entity.charAt(1).toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : whole;
    }
    return entities[entity.toLowerCase()] ?? whole;
  });
}
export function cleanHtml(html: string): string {
  // Remove invisible containers before tokenization, including inline XBRL metadata.
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|head|ix:header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<([\w:-]+)\b[^>]*(?:\bhidden(?:\s|=|>)|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden))[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  let output = ''; let cell = ''; let cells: string[] | null = null; let inCell = false; let firstRow = false;
  for (const token of clean.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (!token.startsWith('<')) {
      const value = decode(token).replace(/\s+/g, ' ');
      if (inCell) cell += value; else output += value;
      continue;
    }
    const tag = /^<\s*(\/?)\s*([\w:-]+)/.exec(token); if (!tag) continue;
    const closing = !!tag[1]; const name = tag[2]!.toLowerCase();
    if (name === 'table' && !closing) { firstRow = true; output += '\n'; }
    else if (name === 'tr' && !closing) { cells = []; output += '\n'; }
    else if ((name === 'td' || name === 'th') && !closing) { cell = ''; inCell = true; }
    else if ((name === 'td' || name === 'th') && closing) { cells?.push(cell.trim().replace(/\|/g, '\\|')); inCell = false; }
    else if (name === 'tr' && closing && cells) { output += `| ${cells.join(' | ')} |\n`; if (firstRow) { output += `| ${cells.map(() => '---').join(' | ')} |\n`; firstRow = false; } cells = null; }
    else if (/^h[1-6]$/.test(name)) output += closing ? '\n\n' : '\n\n## ';
    else if (name === 'hr' && /page-break|break-after/i.test(token)) output += '\f';
    else if (['p', 'div', 'br', 'table', 'li'].includes(name) && !inCell) {
      output += /page-break-before\s*:\s*always/i.test(token) ? '\f' : '\n';
    }
  }
  return output.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function prepareSections(input: PrepareDocumentInput, maxChars = 24_000): PreparedSection[] {
  if (maxChars < 256 || maxChars >= 30_000) throw new Error('Section bound must be 256–29999 characters');
  const content = input.format === 'html' ? cleanHtml(input.content) : input.content;
  const sections: PreparedSection[] = []; let page = 1;
  for (const pageText of content.split('\f')) {
    for (const fragment of pageText.split(/(?=^## )/m)) {
      let rest = fragment.trim(); const title = /^## (.+)/.exec(rest)?.[1]?.trim() ?? 'Document';
      while (rest.length) {
        let end = Math.min(rest.length, maxChars);
        if (end < rest.length) {
          const newline = rest.lastIndexOf('\n', end); if (newline > maxChars / 2) end = newline;
          // Never split a surrogate pair.
          if (/[\uD800-\uDBFF]/.test(rest.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(rest.charAt(end))) end--;
        }
        const text = rest.slice(0, end).trim(); rest = rest.slice(end).trim(); if (!text) continue;
        const ordinal = sections.length;
        sections.push({ id: `${input.runId}:${input.documentId}:${ordinal}`, documentId: input.documentId, ordinal,
          title, item: /(?:Item\s+[\dA-Z.]+|Note\s+\d+)/i.exec(title)?.[0] ?? 'Document',
          kind: /^\|/m.test(text) ? 'table' : 'text', text, charCount: text.length,
          page: content.includes('\f') ? page : null, sourceUrl: input.sourceUrl ?? null });
      }
    }
    page++;
  }
  return sections;
}
