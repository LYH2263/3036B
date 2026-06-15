import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class WordResultDto {
  @IsString({ message: '词条 ID 格式不正确' })
  wordEntryId!: string;

  @IsString({ message: '用户输入格式不正确' })
  userInput!: string;

  @IsString({ message: '正确答案格式不正确' })
  correctWord!: string;

  @IsOptional()
  @IsString({ message: '例句格式不正确' })
  exampleSentence?: string;

  @IsString({ message: '判定结果格式不正确' })
  correct!: boolean;
}

export class SubmitDictationDto {
  @IsArray({ message: '单词结果列表格式不正确' })
  @ArrayMinSize(1, { message: '单词结果列表不能为空' })
  @ValidateNested({ each: true })
  @Type(() => WordResultDto)
  wordResults!: WordResultDto[];

  @IsOptional()
  @IsString({ message: '客户端事件 ID 格式不正确' })
  @MaxLength(120, { message: '客户端事件 ID 长度不能超过 120' })
  clientEventId?: string;
}
