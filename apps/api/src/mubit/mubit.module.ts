import { Global, Module } from '@nestjs/common';
import { MubitController } from './mubit.controller';
import { MubitService } from './mubit.service';

@Global()
@Module({ providers: [MubitService], controllers: [MubitController], exports: [MubitService] })
export class MubitModule {}
