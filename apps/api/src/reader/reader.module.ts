import { Module } from '@nestjs/common';
import { ReaderController } from './reader.controller';

@Module({ controllers: [ReaderController] })
export class ReaderModule {}
