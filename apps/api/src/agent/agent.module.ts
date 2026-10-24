import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EdgarModule } from '../edgar/edgar.module';
import { ExtractionStubModule } from '../extraction-stub/extraction-stub.module';
import { ProjectsModule } from '../projects/projects.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolsService } from './tools.service';

@Module({
  // Swap ExtractionStubModule for the real ExtractionModule when it lands.
  imports: [EdgarModule, DashboardModule, ProjectsModule, ExtractionStubModule],
  providers: [AgentService, ToolsService],
  controllers: [AgentController],
})
export class AgentModule {}
