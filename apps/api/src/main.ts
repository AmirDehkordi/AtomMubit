import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { config } from './core/config';
import { DbService } from './db/db.service';
import { JobsService } from './jobs/jobs.service';
import { ProcessorService } from './extraction/processor.service';
import { FeedbackService } from './feedback/feedback.service';
import { WorkerLoop } from './jobs/worker-loop';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json',{limit:'1mb'});
  app.enableCors({ origin: config.webOrigin });
  app.enableShutdownHooks();
  await app.listen(config.port);
  if(!config.databaseUrl && process.env.RUN_LOCAL_WORKER !== '0') {
    const worker = new WorkerLoop(app.get(DbService),app.get(JobsService),app.get(ProcessorService),app.get(FeedbackService));
    process.once('SIGTERM',()=>worker.stop()); process.once('SIGINT',()=>worker.stop());
    void worker.run();
  }
  console.log(`API on http://localhost:${config.port}`);
}
void bootstrap();
