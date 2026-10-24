import { Controller, Get, MessageEvent, Param, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { TOOL_NAMES } from '@desk/shared';
import { config } from './core/config';
import { EventsService } from './core/events.service';
import { DbService } from './db/db.service';
import { rules } from './db/schema';

@Controller()
export class HealthController {
  constructor(
    private readonly dbs: DbService,
    private readonly events: EventsService,
  ) {}

  @Get('health')
  async health() {
    return {
      ok: true,
      database: config.databaseUrl ? 'postgres' : 'pglite',
      rules: await this.dbs.db.$count(rules),
      mubitKey: config.mubitApiKey ? 'set' : 'missing',
      secUserAgent: config.secUserAgent ? 'set' : 'missing',
      tools: TOOL_NAMES,
    };
  }

  /** Background stream for one project: extraction progress and block status changes. */
  @Sse('events/:projectId')
  stream(@Param('projectId') projectId: string): Observable<MessageEvent> {
    return this.events.forProject(projectId).pipe(map((e) => ({ data: e.event })));
  }
}
