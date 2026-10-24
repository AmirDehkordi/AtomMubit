import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  TOOL_ARGS,
  formatChange,
  formatValue,
  type ExtractionApi,
  type ToolArgs,
  type ToolName,
  type ViewSpec,
} from '@desk/shared';
import { EXTRACTION_API } from '../core/extraction.token';
import { DashboardService, change } from '../dashboard/dashboard.service';
import { DbService } from '../db/db.service';
import { blocks, companies, filings, projects } from '../db/schema';
import { ExtractionService } from '../extraction/extraction.service';
import { EdgarService } from '../edgar/edgar.service';
import { fiscalLabel, quarterName } from '../edgar/fiscal';
import { XbrlService } from '../xbrl/xbrl.service';


export interface ToolContext {
  projectId: string;
  conversationId: string;
  /** Replayed conversations don't start real extraction. */
  replay: boolean;
}

export interface ToolResult {
  /** JSON sent back to the model. Kept short: summaries and ids, not documents. */
  output: string;
  /** One line for the chat's step list. */
  summary: string;
  ok: boolean;
  /** ask_user: show this card and end the turn. */
  choice?: { id: string; question: string; options: string[] };
  /** show_on_dashboard: the view to show. */
  view?: ViewSpec;
}

/** Short labels for the chat's step list while a tool runs. */
export const STEP_LABELS: Record<ToolName, string> = {
  find_filings: 'Searching SEC EDGAR',
  ask_user: 'Asking you',
  add_filings: 'Adding filings to the desk',
  get_metrics: 'Reading XBRL figures',
  search_blocks: 'Searching what the desk has read',
  get_blocks: 'Opening passages',
  compare: 'Comparing companies',
  show_on_dashboard: 'Updating the dashboard',
  get_insider_activity: 'Checking insider activity',
  diff_risk_factors: 'Comparing risk factors',
};

const SNIPPET = 220;

/** Runs the agent's tools. Every handler validates its arguments with the shared Zod schema. */
@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly edgar: EdgarService,
    private readonly xbrl: XbrlService,
    private readonly dashboard: DashboardService,
    @Inject(EXTRACTION_API) private readonly extraction: ExtractionService,
  ) {}

  async run(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolResult> {
    if (!(name in TOOL_ARGS)) return fail(`Unknown tool ${name}`);
    const tool = name as ToolName;
    let args: unknown;
    try {
      args = TOOL_ARGS[tool].parse(JSON.parse(rawArgs || '{}'));
    } catch (err) {
      return fail(`Invalid arguments: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      return await this.dispatch(tool, args, ctx);
    } catch (err) {
      this.logger.warn(`${tool} failed: ${String(err)}`);
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  private dispatch(tool: ToolName, args: unknown, ctx: ToolContext): Promise<ToolResult> {
    switch (tool) {
      case 'find_filings':
        return this.findFilings(args as ToolArgs<'find_filings'>);
      case 'ask_user':
        return Promise.resolve(this.askUser(args as ToolArgs<'ask_user'>));
      case 'add_filings':
        return this.addFilings(args as ToolArgs<'add_filings'>, ctx);
      case 'get_metrics':
        return this.getMetrics(args as ToolArgs<'get_metrics'>);
      case 'search_blocks':
        return this.searchBlocks(args as ToolArgs<'search_blocks'>, ctx);
      case 'get_blocks':
        return this.getBlocks(args as ToolArgs<'get_blocks'>, ctx);
      case 'compare':
        return this.compare(args as ToolArgs<'compare'>);
      case 'show_on_dashboard':
        return this.show(args as ToolArgs<'show_on_dashboard'>, ctx);
      case 'get_insider_activity':
      case 'diff_risk_factors':
        return Promise.resolve(fail('Not available yet.', 'Not available yet'));
    }
  }

  private async findFilings(args: ToolArgs<'find_filings'>): Promise<ToolResult> {
    const found = await this.edgar.findFilings(args);
    const list = found.filings.map((f) => ({
      accession: f.accession,
      form: f.form,
      quarter: f.quarter,
      periodEnd: f.periodEnd,
      filedAt: f.filedAt,
    }));
    const quarters = [...found.filings].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).map((f) => f.quarter);
    return ok(
      { company: { ticker: found.company.ticker, name: found.company.name }, filings: list, warnings: found.warnings },
      list.length
        ? `Found ${list.length} filing${list.length === 1 ? '' : 's'} for ${found.company.ticker}: ${range(quarters)}`
        : `No matching filings for ${found.company.ticker}`,
    );
  }

  private askUser(args: ToolArgs<'ask_user'>): ToolResult {
    const choice = { id: randomUUID(), question: args.question, options: args.options };
    return {
      ...ok({ shown: true, note: "The user's answer arrives as their next message. Stop here." }, args.question),
      choice,
    };
  }

  private async addFilings(args: ToolArgs<'add_filings'>, ctx: ToolContext): Promise<ToolResult> {
    const rows = await this.dbs.db
      .select({ accession: filings.accession, periodEnd: filings.periodEnd, ticker: companies.ticker, fye: companies.fiscalYearEnd })
      .from(filings)
      .innerJoin(companies, eq(filings.cik, companies.cik))
      .where(inArray(filings.accession, args.accessions));
    const missing = args.accessions.filter((a) => !rows.some((r) => r.accession === a));
    if (!rows.length) return fail('None of those accession numbers were found. Call find_filings first.');

    await this.dbs.db
      .update(filings)
      .set({ status: ctx.replay ? 'found' : 'queued' })
      .where(inArray(filings.accession, rows.map((r) => r.accession)));

    const tickers = [...new Set(rows.map((r) => r.ticker))];
    const quarters = rows
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
      .map((r) => quarterName(fiscalLabel(r.periodEnd, r.fye.replace('-', ''))));
    await this.dbs.db
      .update(projects)
      .set({ title: `${tickers.join(', ')} · ${range(quarters)}` })
      .where(eq(projects.id, ctx.projectId));

    if (!ctx.replay) {
      for (const r of rows) {
        await this.extraction.submitFiling(r.accession, ctx.projectId);
      }
    }
    return ok(
      {
        added: rows.map((r) => ({ accession: r.accession, ticker: r.ticker, periodEnd: r.periodEnd })),
        missing,
        note: 'The desk is reading these filings in the background. XBRL figures are available now.',
      },
      `Added ${rows.length} filing${rows.length === 1 ? '' : 's'}`,
    );
  }

  private async getMetrics(args: ToolArgs<'get_metrics'>): Promise<ToolResult> {
    const series = await this.dashboard.series(args.ticker, args.metrics, args.periodEnds);
    const values = series.rows.map((row) => ({
      metric: row.key,
      label: row.label,
      quarters: series.quarters.map(({ periodEnd, quarter }, i) => {
        const c = row.cells[i]!;
        const before = i > 0 ? row.cells[i - 1]!.value : null;
        return {
          quarter,
          periodEnd,
          value: formatValue(c.value, row.unit),
          changeVsPrevious: formatChange(change(c.value, before, row.kind === 'margin'), row.kind === 'margin'),
          how: c.method,
          note: c.note,
          approximate: c.approximate || undefined,
          restated: c.restated || undefined,
          sources: c.accessions,
        };
      }),
    }));
    return ok(
      { company: { ticker: series.ticker, name: series.name }, values },
      `${series.ticker}: ${args.metrics.length} metric${args.metrics.length === 1 ? '' : 's'} × ${series.quarters.length} quarter${series.quarters.length === 1 ? '' : 's'}`,
    );
  }

  private async compare(args: ToolArgs<'compare'>): Promise<ToolResult> {
    const result = await this.dashboard.compare(args.metric, args.tickers, args.periodEnd);
    return ok(
      {
        metric: result.label,
        companies: result.rows.map((r) => ({
          ticker: r.ticker,
          quarter: r.quarter,
          periodEnd: r.periodEnd,
          value: formatValue(r.value.value, result.unit),
          yearAgo: formatValue(r.yearAgo.value, result.unit),
          changeVsYearAgo: formatChange(r.yoy, result.unit === 'percent'),
          sources: r.value.accessions,
        })),
      },
      `${result.label} across ${result.rows.map((r) => r.ticker).join(', ')}`,
    );
  }

  private async searchBlocks(args: ToolArgs<'search_blocks'>, ctx: ToolContext): Promise<ToolResult> {
    const inProject = sql`(${blocks.accession} in (select accession from project_filings where project_id = ${ctx.projectId}) or ${blocks.accession} in (select accession from filings where project_id = ${ctx.projectId}))`;
    const current = sql`(exists (select 1 from extraction_runs er where ${blocks.sectionId} like er.id || ':%' and er.project_id = ${ctx.projectId} and er.accepted = true) or not exists (select 1 from extraction_runs er where ${blocks.sectionId} like er.id || ':%'))`;
    const conditions = [inProject, current, sql`${blocks.tsv} @@ plainto_tsquery('english', ${args.query})`];
    if (args.ticker) conditions.push(eq(companies.ticker, args.ticker.toUpperCase()));
    if (args.periodEnd) conditions.push(eq(blocks.periodEnd, args.periodEnd));
    if (args.types.length) conditions.push(inArray(blocks.type, args.types));
    const rows = await this.dbs.db
      .select({
        id: blocks.id,
        type: blocks.type,
        label: blocks.label,
        text: blocks.text,
        quote: blocks.quote,
        periodEnd: blocks.periodEnd,
        ticker: companies.ticker,
        status: blocks.status,
      })
      .from(blocks)
      .innerJoin(filings, eq(blocks.accession, filings.accession))
      .innerJoin(companies, eq(filings.cik, companies.cik))
      .where(and(...conditions))
      .orderBy(sql`ts_rank(${blocks.tsv}, plainto_tsquery('english', ${args.query})) desc`)
      .limit(8);
    if (!rows.length) {
      const [count] = await this.dbs.db.select({ n: sql<number>`count(*)::int` }).from(blocks).where(inProject);
      const n = count?.n ?? 0;
      return ok(
        { blocks: [], note: n ? 'No passages match.' : 'Nothing has been read from these filings yet.' },
        n ? 'No matching passages' : 'Nothing read yet',
      );
    }
    return ok(
      {
        blocks: rows.map((r) => ({
          id: r.id,
          type: r.type,
          ticker: r.ticker,
          periodEnd: r.periodEnd,
          label: r.label,
          snippet: (r.text ?? r.quote).slice(0, SNIPPET),
          checked: r.status,
        })),
      },
      `Found ${rows.length} passage${rows.length === 1 ? '' : 's'}`,
    );
  }

  private async getBlocks(args: ToolArgs<'get_blocks'>, ctx: ToolContext): Promise<ToolResult> {
    const rows = await this.dbs.db
      .select()
      .from(blocks)
      .where(and(inArray(blocks.id, args.ids), isNotNull(blocks.id), sql`(${blocks.accession} in (select accession from project_filings where project_id = ${ctx.projectId}) or ${blocks.accession} in (select accession from filings where project_id = ${ctx.projectId}))`));
    return ok(
      {
        blocks: rows.map((r) => ({
          id: r.id,
          type: r.type,
          label: r.label,
          periodEnd: r.periodEnd,
          text: r.text,
          quote: r.quote,
          accession: r.accession,
          checked: r.status,
        })),
      },
      `Opened ${rows.length} passage${rows.length === 1 ? '' : 's'}`,
    );
  }

  private async show(args: ToolArgs<'show_on_dashboard'>, ctx: ToolContext): Promise<ToolResult> {
    await this.dashboard.show(ctx.projectId, args.spec);
    return { ...ok({ shown: args.spec.view }, `Showing ${args.spec.view.replace(/_/g, ' ')}`), view: args.spec };
  }
}

function ok(payload: unknown, summary: string): ToolResult {
  return { output: JSON.stringify(payload), summary, ok: true };
}

function fail(error: string, summary = error): ToolResult {
  return { output: JSON.stringify({ error }), summary, ok: false };
}

function range(quarters: string[]): string {
  if (quarters.length <= 1) return quarters[0] ?? '';
  return `${quarters[0]} → ${quarters[quarters.length - 1]}`;
}
