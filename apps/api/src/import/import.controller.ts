import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { BatchAddDto } from './batch-add.dto';
import { ImportService } from './import.service';
import { ParseTextDto } from './parse-text.dto';

@UseGuards(JwtAuthGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('parse')
  parse(@CurrentUser() user: CurrentUserPayload, @Body() dto: ParseTextDto) {
    return this.importService.parseText(user.sub, dto);
  }

  @Post('batch-add')
  batchAdd(@CurrentUser() user: CurrentUserPayload, @Body() dto: BatchAddDto) {
    return this.importService.batchAdd(user.sub, dto);
  }
}
