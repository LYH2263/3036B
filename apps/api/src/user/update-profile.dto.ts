import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: '昵称格式不正确' })
  @MaxLength(32, { message: '昵称长度不能超过 32 个字符' })
  nickname?: string;

  @IsOptional()
  @IsString({ message: '头像颜色格式不正确' })
  avatarColor?: string;
}
