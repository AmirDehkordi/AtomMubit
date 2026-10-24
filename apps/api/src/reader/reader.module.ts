import { Module } from '@nestjs/common';
import { EdgarModule } from '../edgar/edgar.module';
import { ReaderController } from './reader.controller';

@Module({ imports: [EdgarModule], controllers: [ReaderController] })
export class ReaderModule {}
