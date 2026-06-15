import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { MatchGameService } from './match-game.service';
import { GetMatchGameWordsDto } from './get-match-game-words.dto';
import { SubmitMatchGameDto } from './submit-match-game.dto';

@UseGuards(JwtAuthGuard)
@Controller('match-game')
export class MatchGameController {
  constructor(private readonly matchGameService: MatchGameService) {}

  @Get('words')
  getWords(@CurrentUser() user: CurrentUserPayload, @Query() dto: GetMatchGameWordsDto) {
    return this.matchGameService.getWords(user.sub, dto);
  }

  @Post('attempts')
  submitAttempt(@CurrentUser() user: CurrentUserPayload, @Body() dto: SubmitMatchGameDto) {
    return this.matchGameService.submitAttempt(user.sub, dto);
  }

  @Get('best-score')
  getBestScore(
    @CurrentUser() user: CurrentUserPayload,
    @Query('difficulty') difficulty: string
  ) {
    return this.matchGameService.getBestScore(user.sub, difficulty ?? 'normal');
  }
}
