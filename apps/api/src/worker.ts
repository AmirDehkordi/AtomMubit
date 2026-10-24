import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { DbService } from './db/db.service';
import { CoreModule } from './core/core.module';
import { MubitModule } from './mubit/mubit.module';
import { ExtractionModule } from './extraction/extraction.module';
import { ProcessorService } from './extraction/processor.service';
import { FeedbackService } from './feedback/feedback.service';
import { JobsService } from './jobs/jobs.service';
import { WorkerLoop } from './jobs/worker-loop';
@Module({imports:[DbModule,CoreModule,MubitModule,ExtractionModule]}) class WorkerModule {}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Separate worker requires DATABASE_URL; PGlite cannot be shared across processes.');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const worker = new WorkerLoop(app.get(DbService),app.get(JobsService),app.get(ProcessorService),app.get(FeedbackService));
  process.once('SIGTERM',()=>worker.stop()); process.once('SIGINT',()=>worker.stop());
  try {await worker.run();} finally {await app.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
