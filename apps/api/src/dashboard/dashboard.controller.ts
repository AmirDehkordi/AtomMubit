import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MetricKey } from '@desk/shared';
import { DashboardService } from './dashboard.service';

const list = (v: unknown) => (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()) : []);

/** Data for the dashboard views. */
@Controller('views')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // GET /views/quarter-overview?ticker=NVDA&periods=2025-10-26,2026-01-25
  @Get('quarter-overview')
  overview(@Query('ticker') ticker: string, @Query('periods') periods: string) {
    if (!ticker || !list(periods).length) throw new BadRequestException('ticker and periods are required');
    return this.dashboard.quarterOverview(ticker, list(periods));
  }

  // GET /views/compare?metric=revenue&tickers=NVDA,MSFT&periodEnd=
  @Get('compare')
  compare(@Query('metric') metric: string, @Query('tickers') tickers: string, @Query('periodEnd') periodEnd?: string) {
    const parsed = MetricKey.safeParse(metric);
    if (!parsed.success || list(tickers).length < 1) throw new BadRequestException('metric and tickers are required');
    return this.dashboard.compare(parsed.data, list(tickers), periodEnd || null);
  }
}
