import { IsArray, IsUUID, ArrayMaxSize } from 'class-validator';

export class BatchAddDto {
  @IsArray({ message: '词条 ID 列表格式不正确' })
  @IsUUID('4', { message: '词条 ID 格式不正确', each: true })
  @ArrayMaxSize(200, { message: '单次最多添加 200 个词条' })
  wordEntryIds!: string[];
}
