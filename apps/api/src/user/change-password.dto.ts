import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString({ message: '旧密码格式不正确' })
  oldPassword!: string;

  @IsString({ message: '新密码格式不正确' })
  @MinLength(6, { message: '新密码长度至少为 6 位' })
  newPassword!: string;
}
