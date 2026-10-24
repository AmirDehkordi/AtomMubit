import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EdgarModule } from '../edgar/edgar.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { ProjectsModule } from '../projects/projects.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolsService } from './tools.service';

@Module({
  imports: [EdgarModule, DashboardModule, ProjectsModule, ExtractionModule],
  providers: [AgentService, ToolsService],
  controllers: [AgentController],
})
export class AgentModule {}
