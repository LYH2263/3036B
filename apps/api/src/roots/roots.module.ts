import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RootsController } from './roots.controller';
import { RootsService } from './roots.service';

@Module({
  imports: [PrismaModule],
  controllers: [RootsController],
  providers: [RootsService]
})
export class RootsModule {}
