import { Module } from '@nestjs/common';

import { DailyWordController } from './daily-word.controller';
import { DailyWordService } from './daily-word.service';

@Module({
  controllers: [DailyWordController],
  providers: [DailyWordService]
})
export class DailyWordModule {}
