import { IsOptional, IsString, IsEnum } from 'class-validator';
import { RootType } from '@prisma/client';

export class GetRootsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(RootType)
  type?: RootType;

  @IsOptional()
  @IsString()
  cursor?: string;
}
