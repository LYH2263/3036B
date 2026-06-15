import { Module } from '@nestjs/common';

import { MatchGameController } from './match-game.controller';
import { MatchGameService } from './match-game.service';

@Module({
  controllers: [MatchGameController],
  providers: [MatchGameService]
})
export class MatchGameModule {}
