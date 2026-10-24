import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { companies, conversations, filings, messages, projectFilings, projects } from '../db/schema';
import { fiscalLabel, quarterName } from '../edgar/fiscal';
import { DashboardService } from '../dashboard/dashboard.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly dbs: DbService,
    private readonly dashboard: DashboardService,
  ) {}

  /** A new desk: one project with one conversation. */
  async create(replay = false): Promise<{ projectId: string; conversationId: string }> {
    const projectId = randomUUID();
    const conversationId = randomUUID();
    await this.dbs.db.insert(projects).values({ id: projectId, title: 'New desk', teamId: process.env.TEAM_ID || 'internal' });
    await this.dbs.db.insert(conversations).values({ id: conversationId, projectId, replay });
    return { projectId, conversationId };
  }

  async conversation(id: string) {
    const [row] = await this.dbs.db.select().from(conversations).where(eq(conversations.id, id));
    if (!row) throw new NotFoundException(`No conversation ${id}`);
    const [project] = await this.dbs.db.select().from(projects).where(and(eq(projects.id,row.projectId),eq(projects.teamId,process.env.TEAM_ID || 'internal')));
    if(!project) throw new NotFoundException(`No conversation ${id}`);
    return row;
  }

  async rename(projectId: string, title: string): Promise<void> {
    await this.dbs.db.update(projects).set({ title }).where(and(eq(projects.id,projectId),eq(projects.teamId,process.env.TEAM_ID || 'internal')));
  }

  /** Everything the desk page needs to render a project. */
  async get(projectId: string) {
    const [project] = await this.dbs.db.select().from(projects).where(and(eq(projects.id,projectId),eq(projects.teamId,process.env.TEAM_ID || 'internal')));
    if (!project) throw new NotFoundException(`No project ${projectId}`);
    const [conversation] = await this.dbs.db
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, projectId));
    const history = conversation
      ? await this.dbs.db
          .select({
            id: messages.id,
            role: messages.role,
            content: messages.content,
            toolTrace: messages.toolTrace,
            choice: messages.choice,
          })
          .from(messages)
          .where(eq(messages.conversationId, conversation.id))
          .orderBy(asc(messages.createdAt))
      : [];
    return {
      project,
      conversationId: conversation?.id ?? null,
      messages: history,
      filings: await this.filings(projectId),
      view: await this.dashboard.current(projectId),
      views: await this.dashboard.history(projectId),
    };
  }

  async filings(projectId: string) {
    const rows = await this.dbs.db
      .select({
        accession: filings.accession,
        form: filings.form,
        periodEnd: filings.periodEnd,
        fiscalYear: filings.fiscalYear,
        fiscalPeriod: filings.fiscalPeriod,
        filedAt: filings.filedAt,
        url: filings.url,
        status: filings.status,
        ticker: companies.ticker,
        company: companies.name,
        fiscalYearEnd: companies.fiscalYearEnd,
      })
      .from(projectFilings)
      .innerJoin(filings, eq(projectFilings.accession, filings.accession))
      .innerJoin(companies, eq(filings.cik, companies.cik))
      .where(eq(projectFilings.projectId, projectId))
      .orderBy(asc(filings.periodEnd));
    return rows.map(({ fiscalYearEnd, ...f }) => ({
      ...f,
      quarter: quarterName(fiscalLabel(f.periodEnd, fiscalYearEnd.replace('-', ''))),
    }));
  }
}
