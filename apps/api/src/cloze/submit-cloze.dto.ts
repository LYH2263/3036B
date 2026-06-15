import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitClozeDto {
  @IsOptional()
  @IsString({ message: '客户端事件 ID 格式不正确' })
  @MaxLength(120, { message: '客户端事件 ID 长度不能超过 120' })
  clientEventId?: string;

  @IsString({ message: '词条 ID 格式不正确' })
  wordEntryId!: string;

  @IsString({ message: '目标单词格式不正确' })
  targetWord!: string;

  @IsString({ message: '例句格式不正确' })
  sentence!: string;

  @IsString({ message: '用户答案格式不正确' })
  userAnswer!: string;

  @IsBoolean({ message: '是否正确格式不正确' })
  correct!: boolean;

  @IsBoolean({ message: '是否使用提示格式不正确' })
  usedHint!: boolean;

  @IsBoolean({ message: '是否跳过格式不正确' })
  skipped!: boolean;

  @IsInt({ message: '总题数格式不正确' })
  totalQuestions!: number;

  @IsInt({ message: '正确数格式不正确' })
  correctCount!: number;

  @IsNumber({}, { message: '正确率格式不正确' })
  accuracy!: number;
}
