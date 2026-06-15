import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GetMatchGameWordsDto {
  @IsOptional()
  @IsInt({ message: '数量格式不正确' })
  @Min(4, { message: '数量至少为 4' })
  @Max(20, { message: '数量不能超过 20' })
  count?: number;

  @IsOptional()
  @IsString({ message: '难度格式不正确' })
  @IsIn(['easy', 'normal', 'hard'], { message: '难度只能为 easy、normal 或 hard' })
  difficulty?: string;
}
