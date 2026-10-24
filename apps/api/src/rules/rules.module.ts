import { Module } from '@nestjs/common';
import { ExtractionStubModule } from '../extraction-stub/extraction-stub.module';
import { CorrectionsService } from './corrections.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  // Swap ExtractionStubModule for the real ExtractionModule when it lands (as in agent.module.ts).
  imports: [ExtractionStubModule],
  providers: [RulesService, CorrectionsService],
  controllers: [RulesController],
  exports: [RulesService, CorrectionsService],
})
export class RulesModule {}
