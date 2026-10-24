/**
 * The desk's starting house rules (docs/extraction-contract.md, section 7).
 * Every section_extractor call carries the text of all active rules.
 */
export const SEED_RULES: { code: string; text: string }[] = [
  { code: 'R1', text: 'EPS means diluted GAAP EPS. Put adjusted (non-GAAP) EPS in a separate statement block, never under eps_diluted.' },
  { code: 'R2', text: 'revenue is total consolidated revenue, never a segment, product line or "organic" figure.' },
  { code: 'R3', text: 'Take numbers from the three-month column. Year-to-date columns get months 6, 9 or 12.' },
  { code: 'R4', text: 'Fiscal labels follow the company’s fiscal year, as given in filing.' },
  { code: 'R5', text: 'Read the scale from the table header ("in millions", "in thousands") and set scale to match.' },
  { code: 'R6', text: 'Numbers in parentheses are negative.' },
  { code: 'R7', text: 'Guidance is "raised" or "lowered" only if the midpoint of the full-year range moved.' },
  { code: 'R8', text: 'Use null when a figure is not stated. Never estimate or compute one.' },
];
