import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { DictationService } from './dictation.service';
import { GetDictationWordsDto } from './get-dictation-words.dto';
import { SubmitDictationDto } from './submit-dictation.dto';

@UseGuards(JwtAuthGuard)
@Controller('dictation')
export class DictationController {
  constructor(private readonly dictationService: DictationService) {}

  @Get('words')
  getWords(@CurrentUser() user: CurrentUserPayload, @Query() dto: GetDictationWordsDto) {
    return this.dictationService.getWords(user.sub, dto);
  }

  @Post('attempts')
  submitAttempt(@CurrentUser() user: CurrentUserPayload, @Body() dto: SubmitDictationDto) {
    return this.dictationService.submitAttempt(user.sub, dto);
  }
}
