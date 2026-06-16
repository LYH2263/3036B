import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { LeaderboardDto } from '@lexigram/shared';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { GetLeaderboardDto } from './get-leaderboard.dto';
import { LeaderboardService } from './leaderboard.service';

@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  getLeaderboard(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: GetLeaderboardDto
  ): Promise<LeaderboardDto> {
    return this.leaderboardService.getLeaderboard(user.sub, query);
  }
}
