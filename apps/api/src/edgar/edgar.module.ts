import { Module } from '@nestjs/common';
import { XbrlService } from '../xbrl/xbrl.service';
import { EdgarClient } from './edgar.client';
import { EdgarController } from './edgar.controller';
import { EdgarService } from './edgar.service';

@Module({
  providers: [EdgarClient, EdgarService, XbrlService],
  controllers: [EdgarController],
  exports: [EdgarClient, EdgarService, XbrlService],
})
export class EdgarModule {}
