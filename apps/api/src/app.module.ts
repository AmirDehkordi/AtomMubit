import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module';
import { CoreModule } from './core/core.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DbModule } from './db/db.module';
import { EdgarModule } from './edgar/edgar.module';
import { HealthController } from './health.controller';
import { MubitModule } from './mubit/mubit.module';
import { ProjectsModule } from './projects/projects.module';
import { ReaderModule } from './reader/reader.module';

@Module({
  imports: [CoreModule, DbModule, MubitModule, EdgarModule, DashboardModule, ProjectsModule, ReaderModule, AgentModule],
  controllers: [HealthController],
})
export class AppModule {}
