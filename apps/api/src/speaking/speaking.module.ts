import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { SpeakingController } from './speaking.controller';
import { SpeakingService } from './speaking.service';

@Module({
  imports: [PrismaModule],
  controllers: [SpeakingController],
  providers: [SpeakingService],
  exports: [SpeakingService]
})
export class SpeakingModule {}
