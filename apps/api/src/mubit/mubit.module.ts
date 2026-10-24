import { Global, Module } from '@nestjs/common';
import { MubitService } from './mubit.service';

@Global()
@Module({ providers: [MubitService], exports: [MubitService] })
export class MubitModule {}
