import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SubmitMatchGameDto {
  @IsOptional()
  @IsString({ message: '客户端事件 ID 格式不正确' })
  @MaxLength(120, { message: '客户端事件 ID 长度不能超过 120' })
  clientEventId?: string;

  @IsOptional()
  @IsString({ message: '难度格式不正确' })
  @IsIn(['easy', 'normal', 'hard'], { message: '难度只能为 easy、normal 或 hard' })
  difficulty?: string;

  @IsInt({ message: '词数格式不正确' })
  @Min(4, { message: '词数至少为 4' })
  wordCount!: number;

  @IsInt({ message: '限时格式不正确' })
  @Min(10, { message: '限时至少 10 秒' })
  timeLimitSec!: number;

  @IsInt({ message: '得分格式不正确' })
  @Min(0, { message: '得分不能为负' })
  score!: number;

  @IsInt({ message: '最大连击格式不正确' })
  @Min(0, { message: '最大连击不能为负' })
  maxCombo!: number;

  @IsInt({ message: '匹配数格式不正确' })
  @Min(0, { message: '匹配数不能为负' })
  matchedCount!: number;

  @IsInt({ message: '总词数格式不正确' })
  @Min(1, { message: '总词数至少为 1' })
  totalWords!: number;

  @IsNumber({}, { message: '用时格式不正确' })
  @Min(0, { message: '用时不能为负' })
  timeUsedSec!: number;

  @IsBoolean({ message: '胜负格式不正确' })
  won!: boolean;
}
