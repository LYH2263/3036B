import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { SpeakingService } from './speaking.service';
import { GetSpeakingItemsDto } from './get-speaking-items.dto';
import { SubmitSpeakingDto } from './submit-speaking.dto';

@UseGuards(JwtAuthGuard)
@Controller('speaking')
export class SpeakingController {
  constructor(private readonly speakingService: SpeakingService) {}

  @Get('items')
  getItems(@CurrentUser() user: CurrentUserPayload, @Query() dto: GetSpeakingItemsDto) {
    return this.speakingService.getItems(user.sub, dto);
  }

  @Post('attempts')
  submitAttempt(@CurrentUser() user: CurrentUserPayload, @Body() dto: SubmitSpeakingDto) {
    return this.speakingService.submitAttempt(user.sub, dto);
  }

  @Get('best-score')
  getBestScore(
    @CurrentUser() user: CurrentUserPayload,
    @Query('mode') mode: string
  ) {
    return this.speakingService.getBestScore(user.sub, mode || 'word');
  }
}
