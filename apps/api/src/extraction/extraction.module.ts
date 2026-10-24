import { Module } from '@nestjs/common';
import { EdgarModule } from '../edgar/edgar.module';
import { EXTRACTION_API } from '../core/extraction.token';
import { JobsService } from '../jobs/jobs.service';
import { FeedbackService } from '../feedback/feedback.service';
import { WorkflowService } from '../workflows/workflow.service';
import { GatewayController } from '../workflows/gateway.controller';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { ProcessorService } from './processor.service';
@Module({ imports:[EdgarModule], controllers:[ExtractionController,GatewayController],
  providers:[ExtractionService,JobsService,ProcessorService,FeedbackService,WorkflowService,{provide:EXTRACTION_API,useExisting:ExtractionService}],
  exports:[ExtractionService,JobsService,ProcessorService,FeedbackService,EXTRACTION_API],
})
export class ExtractionModule {}
