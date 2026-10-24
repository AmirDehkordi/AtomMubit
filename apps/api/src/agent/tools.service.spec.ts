import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {resolve} from 'node:path';
import * as schema from '../db/schema';
import {ToolsService} from './tools.service';

let client: PGlite, tools: ToolsService;
const passages = vi.fn().mockResolvedValue([{id: 'p:public-filing:0', ticker: 'TEST', form: '10-Q', documentType: '10-Q', quarter: 'Q2 FY2026', text: 'Public filing passage.'}]);
beforeAll(async () => {
  client = new PGlite(); const db = drizzle(client, {schema});
  await migrate(db, {migrationsFolder: resolve(__dirname, '../../drizzle')});
  await db.insert(schema.projects).values([{id:'a',title:'A'},{id:'b',title:'B'}]);
  await db.insert(schema.companies).values({cik:1,ticker:'TEST',name:'Test',fiscalYearEnd:'12-31'});
  for (const projectId of ['a','b']) {
    const accession = `filing-${projectId}`;
    await db.insert(schema.filings).values({accession,cik:1,form:'10-Q',periodEnd:'2026-06-30',fiscalYear:2026,fiscalPeriod:'Q2',filedAt:'2026-07-31',url:'https://example.com'});
    await db.insert(schema.projectFilings).values({projectId,accession});
    await db.insert(schema.sections).values({id:`section-${projectId}`,accession,item:'1',title:'Revenue',kind:'text',ordinal:0,text:'Revenue 100',charCount:11});
    await db.insert(schema.blocks).values({id:`block-${projectId}`,sectionId:`section-${projectId}`,accession,type:'metric',label:'Revenue',quote:'Revenue 100',status:'verified'});
  }
  tools = new ToolsService({db} as any, {} as any, {} as any, {} as any, {passages} as any, {} as any);
},60000);
afterAll(async () => {await client?.close();});
it('opens public passages and project blocks together without returning another project’s blocks',async () => {
  const result=await tools.run('get_blocks',JSON.stringify({ids:['block-a','block-b','p:public-filing:0']}),{projectId:'a',conversationId:'c',replay:true});
  expect(result.ok).toBe(true);
  const output=JSON.parse(result.output);
  expect(output.blocks.map((b: {id:string})=>b.id)).toEqual(['block-a']);
  expect(output.passages).toEqual([expect.objectContaining({id:'p:public-filing:0',text:'Public filing passage.'})]);
  expect(passages).toHaveBeenCalledWith(['p:public-filing:0']);
});
