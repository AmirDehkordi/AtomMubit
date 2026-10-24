import { SectionExtractionV2, DEFAULT_EXTRACTION_FIELDS, type ExtractionFactV2, type ExtractedBlock, type FactCheckV2 } from '@desk/shared';
import { prepareSections, type PrepareDocumentInput, type PreparedSection } from './preparation';
import { verifyFact, evidenceSpan, type ReferenceFact, type VerifiedFact } from './verification';

export interface SectionCallInput {
  schemaVersion: '2'; runId: string; documentId: string; attempt: number;
  company: { ticker: string; name: string; fiscalYearEnd: string } | null;
  filing: { form: string; fiscalYear: number; fiscalPeriod: string; periodEnd: string } | null;
  section: { id: string; item: string; title: string; kind: 'text' | 'table'; page: number | null; sourceUrl: string | null };
  requestedFields: string[]; rules: string[]; content: string;
}
export interface EngineInput extends PrepareDocumentInput {
  company?: SectionCallInput['company']; filing?: SectionCallInput['filing']; requestedFields?: string[]; rules?: string[];
}
export interface EngineAttempt {
  id: string; sectionId: string; attempt: number; requestId: string | null;
  input: SectionCallInput; output: unknown; error: string | null; checks: FactCheckV2[];
}
export interface EngineFact extends VerifiedFact {
  id: string; sectionId: string | null; attemptId: string | null; status: 'verified' | 'fixed' | 'review'; requestId: string | null;
}
export interface EngineBlock extends ExtractedBlock {
  id: string; sectionId: string; span: ReturnType<typeof evidenceSpan>; status: 'verified' | 'fixed' | 'review';
  requestId: string | null; checks: FactCheckV2[]; attemptId: string;
}
export interface EngineResult {
  sections: PreparedSection[]; blocks: EngineBlock[]; facts: EngineFact[]; attempts: EngineAttempt[];
  checks: { targetId: string; check: FactCheckV2 }[]; missingFields: string[];
}
export interface EngineDependencies {
  callJson: (input: SectionCallInput) => Promise<{ output: unknown; requestId?: string | null }>;
  referenceFact?: (fact: ExtractionFactV2) => Promise<ReferenceFact | null>;
  onSection?: (result: { section: PreparedSection; blocks: EngineBlock[]; facts: EngineFact[]; attempts: EngineAttempt[] }) => Promise<void>;
  concurrency?: number;
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freezeDeep(child); }
  return value;
}
const REPAIR_RULE = 'Repair only source-supported facts: use a character-for-character quote containing the printed value, its printed scale and true reporting date/duration (3/6/9/12 months). Keep GAAP and non-GAAP separate; EPS uses units. Use explicit missingReason when unsupported. Never infer a reporting date from a release date, estimate values, or subtract cumulative EPS.';
function asFact(block: ExtractedBlock): ExtractionFactV2 {
  return { key: block.key ?? block.label, label: block.label, basis: 'GAAP', currency: block.unit?.startsWith('USD') ? 'USD' : null,
    period: block.period && [3, 6, 9, 12].includes(block.period.months) ? { ...block.period, months: block.period.months as 3 | 6 | 9 | 12, start: null, fiscalYear: null, fiscalPeriod: null } : null,
    value: block.value, range: null, unit: block.unit, scale: block.scale, qualifier: null, missingReason: null, quote: block.quote };
}
export class ExtractionEngine {
  constructor(private readonly dependencies: EngineDependencies) {}
  async run(input: EngineInput): Promise<EngineResult> {
    const sections = prepareSections(input);
    const fields = [...new Set(input.requestedFields?.length ? input.requestedFields : DEFAULT_EXTRACTION_FIELDS)];
    const outputs: { blocks: EngineBlock[]; facts: EngineFact[]; attempts: EngineAttempt[] }[] = new Array(sections.length);
    let cursor = 0;
    const concurrency = Math.max(1, Math.min(8, this.dependencies.concurrency ?? 4));
    await Promise.all(Array.from({ length: Math.min(concurrency, sections.length) }, async () => {
      while (cursor < sections.length) {
        const index = cursor++; const section = sections[index]!;
        const result = await this.extractSection(input, section, fields);
        outputs[index] = result;
        await this.dependencies.onSection?.({ section, ...result });
      }
    }));
    const facts = outputs.flatMap((result) => result.facts);
    const blocks = outputs.flatMap((result) => result.blocks);
    const missingFields = fields.filter((key) => !facts.some((entry) => entry.fact.key === key && entry.supported));
    for (const key of missingFields) {
      if (facts.some((entry) => entry.fact.key === key && entry.fact.missingReason)) continue;
      const fact: ExtractionFactV2 = { key, label: key, basis: 'unknown', currency: null, period: null, value: null, range: null,
        unit: null, scale: null, qualifier: null, quote: '', missingReason: 'No source-supported observation was extracted from this document; inspect evidence and failed checks before use.' };
      facts.push({ id: `${input.runId}:${input.documentId}:missing:${key}`, sectionId: null, attemptId: null, status: 'review', requestId: null,
        fact, checks: [{ verifier: 'quote', outcome: 'unknown', detail: fact.missingReason! }], span: null, supported: false, normalized: null });
    }
    return freezeDeep({ sections, blocks, facts, attempts: outputs.flatMap((result) => result.attempts), missingFields,
      checks: [...facts, ...blocks].flatMap((item) => item.checks.map((check) => ({ targetId: item.id, check }))) });
  }
  private async extractSection(input: EngineInput, section: PreparedSection, fields: string[]) {
    const attempts: EngineAttempt[] = [];
    let finalBlocks: EngineBlock[] = []; let finalFacts: EngineFact[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = `${section.id}:attempt:${attempt}`;
      const call: SectionCallInput = { schemaVersion: '2', runId: input.runId, documentId: input.documentId, attempt,
        company: input.company ?? null, filing: input.filing ?? null,
        section: { id: section.id, item: section.item, title: section.title, kind: section.kind, page: section.page, sourceUrl: section.sourceUrl },
        requestedFields: fields, rules: [...(input.rules ?? []), ...(attempt ? [REPAIR_RULE] : [])], content: section.text };
      let output: unknown = null; let requestId: string | null = null;
      try {
        const response = await this.dependencies.callJson(freezeDeep(structuredClone(call)));
        output = response.output; requestId = response.requestId ?? null;
      } catch (error) {
        // Transport failures belong to the durable job retry policy, not a schema-repair model call.
        throw error;
      }
      const parsed = SectionExtractionV2.safeParse(output);
      if (!parsed.success) {
        attempts.push({ id, sectionId: section.id, attempt, input: call, output, requestId,
          error: parsed.error.message, checks: [{ verifier: 'schema', outcome: 'fail', detail: 'Output does not satisfy strict section_extraction_v2 schema' }] });
        finalBlocks = []; finalFacts = []; continue;
      }
      const data = parsed.data;
      const occurrence = new Map<string, number>();
      finalFacts = await Promise.all(data.facts.map(async (fact, index): Promise<EngineFact> => {
        const n = occurrence.get(fact.quote) ?? 0; occurrence.set(fact.quote, n + 1);
        // Repeated claims can refer to the same source quote: choose subsequent occurrences when present, otherwise the first.
        const selected = evidenceSpan(section.text, fact.quote, n) ? n : 0;
        const reference = await this.dependencies.referenceFact?.(fact);
        const checked = verifyFact(fact, section, reference, selected);
        if (input.filing && input.filing.form !== '8-K' && fact.period?.end === input.filing.periodEnd
          && fact.period.fiscalYear !== null && fact.period.fiscalYear !== input.filing.fiscalYear) {
          checked.checks.push({ verifier: 'period', outcome: 'fail', detail: 'Fiscal year contradicts filing metadata for the same reporting end date' });
          checked.supported = false;
        }
        return { ...checked, id: `${id}:fact:${index}`, sectionId: section.id, attemptId: id, requestId,
          status: checked.supported ? attempt ? 'fixed' : 'verified' : 'review' };
      }));
      finalBlocks = await Promise.all(data.blocks.map(async (block, index): Promise<EngineBlock> => {
        const fact = asFact(block);
        const numeric = block.value !== null;
        let checks: FactCheckV2[]; const span = evidenceSpan(section.text, block.quote);
        if (numeric) {
          const checked = verifyFact(fact, section, await this.dependencies.referenceFact?.(fact)); checks = checked.checks;
          if (block.period && ![3, 6, 9, 12].includes(block.period.months)) checks.push({ verifier: 'period', outcome: 'fail', detail: 'Unsupported period duration' });
        } else checks = [{ verifier: 'schema', outcome: 'pass', detail: 'Parsed legacy block shape within v2' },
          { verifier: 'quote', outcome: span ? 'pass' : 'fail', detail: 'Display block requires exact source quote; semantic accuracy is not established by this check' }];
        const pass = checks.every((check) => check.outcome !== 'fail');
        return { ...block, id: `${id}:block:${index}`, sectionId: section.id, span, checks, status: pass ? attempt ? 'fixed' : 'verified' : 'review', requestId, attemptId: id };
      }));
      const checks = [...finalFacts, ...finalBlocks].flatMap((entry) => entry.checks);
      attempts.push({ id, sectionId: section.id, attempt, input: call, output, requestId, error: null, checks });
      if (checks.every((check) => check.outcome !== 'fail')) break;
    }
    return freezeDeep({ blocks: finalBlocks, facts: finalFacts, attempts });
  }
}
