import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GetDictationWordsDto {
  @IsOptional()
  @IsInt({ message: '数量格式不正确' })
  @Min(1, { message: '数量至少为 1' })
  @Max(50, { message: '数量不能超过 50' })
  count?: number;

  @IsOptional()
  @IsString({ message: '来源格式不正确' })
  @MaxLength(20, { message: '来源长度不能超过 20' })
  source?: string;
}
