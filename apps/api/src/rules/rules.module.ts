import { Module } from '@nestjs/common';
import { ExtractionModule } from '../extraction/extraction.module';
import { CorrectionsService } from './corrections.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [ExtractionModule],
  providers: [RulesService, CorrectionsService],
  controllers: [RulesController],
  exports: [RulesService, CorrectionsService],
})
export class RulesModule {}
