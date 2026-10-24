import { Module } from '@nestjs/common';
import { EXTRACTION_API } from '../core/extraction.token';
import { ExtractionStubService } from './extraction-stub.service';

@Module({
  providers: [ExtractionStubService, { provide: EXTRACTION_API, useExisting: ExtractionStubService }],
  exports: [EXTRACTION_API],
})
export class ExtractionStubModule {}
