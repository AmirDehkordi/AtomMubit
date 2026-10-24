import { Controller, Get, Headers, MessageEvent, NotFoundException, Param, Query, Sse } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { Observable } from 'rxjs';
import { TOOL_NAMES } from '@desk/shared';
import { config } from './core/config';
import { DbService } from './db/db.service';
import { extractionEvents, projects, rules } from './db/schema';
import { teamId } from './extraction/extraction.service';
@Controller()
export class HealthController {
  constructor(private readonly dbs:DbService) {}
  @Get('health') async health() {
    return {ok:true,database:config.databaseUrl?'postgres':'pglite',rules:await this.dbs.db.$count(rules),mubitKey:config.mubitApiKey?'set':'missing',secUserAgent:config.secUserAgent?'set':'missing',tools:TOOL_NAMES};
  }
  /** Durable cursor supports reconnects and separate API/worker processes. */
  @Sse('events/:projectId')
  async stream(@Param('projectId') projectId:string,@Headers('last-event-id') lastId?:string,@Query('after') after?:string):Promise<Observable<MessageEvent>> {
    const [project]=await this.dbs.db.select().from(projects).where(and(eq(projects.id,projectId),eq(projects.teamId,teamId())));
    if(!project) throw new NotFoundException('Project not found');
    let cursor=Math.max(0,Number(lastId??after)||0);
    return new Observable(subscriber=>{
      let closed=false; let busy=false;
      const poll=async()=>{
        if(busy||closed)return; busy=true;
        try {
          const rows=await this.dbs.db.select().from(extractionEvents).where(and(eq(extractionEvents.projectId,projectId),eq(extractionEvents.teamId,teamId()),gt(extractionEvents.id,cursor))).orderBy(extractionEvents.id).limit(100);
          for(const row of rows) {
            if(closed)break;
            const data=row.type==='block' ? {...row.data,type:'block'}
              : row.type==='extraction_completed'&&row.data.accession ? {type:'extraction',accession:row.data.accession,status:'ready',sectionsDone:0,sectionsTotal:0,fixed:0,review:row.data.state==='needs_review'?1:0}
              : row.type==='failed'&&row.data.accession ? {type:'extraction',accession:row.data.accession,status:'failed',sectionsDone:0,sectionsTotal:0,fixed:0,review:0}
              : {...row,eventType:row.type,type:'extraction_progress'};
            subscriber.next({id:String(row.id),data}); cursor=row.id;
          }
        } catch(error){subscriber.error(error);} finally{busy=false;}
      };
      void poll();const timer=setInterval(()=>void poll(),1000);
      return()=>{closed=true;clearInterval(timer);};
    });
  }
}
