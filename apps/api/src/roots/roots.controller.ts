import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { GetRootsQueryDto } from './get-roots-query.dto';
import { RootsService } from './roots.service';

@UseGuards(JwtAuthGuard)
@Controller('roots')
export class RootsController {
  constructor(private readonly rootsService: RootsService) {}

  @Get()
  getRoots(@Query() query: GetRootsQueryDto) {
    return this.rootsService.getRoots(query);
  }

  @Get(':id')
  getRootDetail(@Param('id') id: string) {
    return this.rootsService.getRootDetail(id);
  }
}
