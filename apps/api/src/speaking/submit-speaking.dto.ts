import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SpeakingWordResultDto {
  @IsString({ message: '目标单词格式不正确' })
  word!: string;

  @IsString({ message: '识别结果格式不正确' })
  recognized!: string;

  @IsString({ message: '匹配类型格式不正确' })
  matchType!: 'correct' | 'wrong' | 'missing' | 'extra';

  @IsNumber({}, { message: '相似度格式不正确' })
  similarity!: number;
}

export class SubmitSpeakingDto {
  @IsOptional()
  @IsString({ message: '客户端事件 ID 格式不正确' })
  @MaxLength(120, { message: '客户端事件 ID 长度不能超过 120' })
  clientEventId?: string;

  @IsOptional()
  @IsString({ message: '词条 ID 格式不正确' })
  wordEntryId?: string;

  @IsString({ message: '目标文本格式不正确' })
  targetText!: string;

  @IsString({ message: '识别文本格式不正确' })
  recognizedText!: string;

  @IsNumber({}, { message: '相似度分数格式不正确' })
  similarityScore!: number;

  @IsArray({ message: '单词结果列表格式不正确' })
  @ArrayMinSize(1, { message: '单词结果列表不能为空' })
  @ValidateNested({ each: true })
  @Type(() => SpeakingWordResultDto)
  wordResults!: SpeakingWordResultDto[];

  @IsInt({ message: '总单词数格式不正确' })
  totalWords!: number;

  @IsInt({ message: '正确数格式不正确' })
  correctCount!: number;

  @IsString({ message: '练习模式格式不正确' })
  practiceMode!: 'word' | 'sentence';
}
