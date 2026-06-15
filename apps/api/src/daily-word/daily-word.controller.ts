import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { DailyWordService } from './daily-word.service';

@UseGuards(JwtAuthGuard)
@Controller('daily-word')
export class DailyWordController {
  constructor(private readonly dailyWordService: DailyWordService) {}

  @Get('today')
  getTodayWord(
    @CurrentUser() user: CurrentUserPayload,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string
  ) {
    const offset = timezoneOffsetMinutes ? parseInt(timezoneOffsetMinutes, 10) : undefined;
    return this.dailyWordService.getTodayWord(user.sub, offset);
  }

  @Post('today/learned')
  markTodayLearned(@CurrentUser() user: CurrentUserPayload) {
    return this.dailyWordService.markLearned(user.sub);
  }

  @Get('history')
  getHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Query('days') days?: string
  ) {
    const daysNum = days ? parseInt(days, 10) : 7;
    return this.dailyWordService.getHistory(user.sub, daysNum);
  }
}
