import { IsString, MaxLength } from 'class-validator';

export class ParseTextDto {
  @IsString({ message: '文本内容格式不正确' })
  @MaxLength(50000, { message: '文本长度不能超过 50000 个字符' })
  text!: string;
}
