import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsString({ message: '发音口音格式不正确' })
  defaultAccent?: string;

  @IsOptional()
  @IsInt({ message: '每日目标必须是整数' })
  @Min(1, { message: '每日目标至少为 1' })
  @Max(200, { message: '每日目标不能超过 200' })
  dailyGoal?: number;

  @IsOptional()
  @IsBoolean({ message: '复习提醒开关格式不正确' })
  reviewReminderEnabled?: boolean;
}
