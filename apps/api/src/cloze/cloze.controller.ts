import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { ClozeService } from './cloze.service';
import { GetClozeItemsDto } from './get-cloze-items.dto';
import { SubmitClozeDto } from './submit-cloze.dto';

@UseGuards(JwtAuthGuard)
@Controller('cloze')
export class ClozeController {
  constructor(private readonly clozeService: ClozeService) {}

  @Get('items')
  getItems(
    @CurrentUser() user: CurrentUserPayload,
    @Query() dto: GetClozeItemsDto
  ) {
    return this.clozeService.getItems(user.sub, dto);
  }

  @Post('attempts')
  submitAttempt(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitClozeDto
  ) {
    return this.clozeService.submitAttempt(user.sub, dto);
  }

  @Get('stats')
  getStats(@CurrentUser() user: CurrentUserPayload) {
    return this.clozeService.getStats(user.sub);
  }
}
