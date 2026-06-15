import { Module } from '@nestjs/common';

import { DictationController } from './dictation.controller';
import { DictationService } from './dictation.service';

@Module({
  controllers: [DictationController],
  providers: [DictationService]
})
export class DictationModule {}
