import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { FocusService } from './focus.service';
import { RecordFocusSessionDto } from './record-focus-session.dto';

@UseGuards(JwtAuthGuard)
@Controller('focus')
export class FocusController {
  constructor(private readonly focusService: FocusService) {}

  @Post('sessions')
  recordSession(@CurrentUser() user: CurrentUserPayload, @Body() dto: RecordFocusSessionDto) {
    return this.focusService.recordSession(user.sub, dto);
  }

  @Get('stats')
  getStats(@CurrentUser() user: CurrentUserPayload) {
    return this.focusService.getStats(user.sub);
  }
}
