import { Module } from '@nestjs/common';
import { EventsService } from './core/events.service';
import { DbModule } from './db/db.module';
import { EdgarModule } from './edgar/edgar.module';
import { MubitModule } from './mubit/mubit.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DbModule, MubitModule, EdgarModule],
  controllers: [HealthController],
  providers: [EventsService],
})
export class AppModule {}
