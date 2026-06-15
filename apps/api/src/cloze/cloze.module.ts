import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ClozeController } from './cloze.controller';
import { ClozeService } from './cloze.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClozeController],
  providers: [ClozeService]
})
export class ClozeModule {}
