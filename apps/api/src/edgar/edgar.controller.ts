import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { TOOL_ARGS } from '@desk/shared';
import { z } from 'zod';
import { XbrlService } from '../xbrl/xbrl.service';
import { DocumentsService } from './documents.service';
import { EdgarError } from './edgar.client';
import { EdgarService } from './edgar.service';

const list = (v: unknown) => (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()) : []);
const intOrNull = (v: unknown) => (typeof v === 'string' && v ? Number(v) : null);

/** HTTP access to the find_filings and get_metrics tools, for the UI and for testing. */
@Controller()
export class EdgarController {
  constructor(
    private readonly edgar: EdgarService,
    private readonly xbrl: XbrlService,
    private readonly documents: DocumentsService,
  ) {}

  // GET /filings/find?ticker=NVDA&forms=10-Q,10-K&lastNQuarters=4
  @Get('filings/find')
  find(@Query() q: Record<string, unknown>) {
    const args = parse(TOOL_ARGS.find_filings, {
      ticker: q.ticker,
      forms: list(q.forms),
      lastNQuarters: intOrNull(q.lastNQuarters),
      fiscalYear: intOrNull(q.fiscalYear),
    });
    return run(() => this.edgar.findFilings(args));
  }

  // GET /metrics?ticker=NVDA&metrics=revenue,net_income&periodEnds=2026-01-25,2026-04-26
  @Get('metrics')
  metrics(@Query() q: Record<string, unknown>) {
    const args = parse(TOOL_ARGS.get_metrics, {
      ticker: q.ticker,
      metrics: list(q.metrics),
      periodEnds: list(q.periodEnds),
    });
    return run(() => this.xbrl.getMetrics(args));
  }

  // GET /filings/0001045810-26-000075/job: the extraction job without the HTML (sizes instead)
  @Get('filings/:accession/job')
  async job(@Param('accession') accession: string) {
    const job = await run(() => this.documents.job(accession, 'preview'));
    return {
      ...job,
      documents: job.documents.map((d, i) => ({ type: d.type, url: d.url, chars: d.html.length, html: `/filings/${accession}/html?doc=${i}` })),
    };
  }

  // GET /filings/0001045810-26-000075/html?doc=0: one document's raw HTML, as the SEC serves it
  @Get('filings/:accession/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async html(@Param('accession') accession: string, @Query('doc') doc?: string) {
    const job = await run(() => this.documents.job(accession, 'preview'));
    const document = job.documents[Number(doc ?? 0)];
    if (!document) throw new NotFoundException(`Filing ${accession} has ${job.documents.length} document(s)`);
    return document.html;
  }
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(z.prettifyError(result.error));
  return result.data;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof EdgarError && err.status === 404) throw new NotFoundException(err.message);
    throw err;
  }
}
