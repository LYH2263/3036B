import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum FocusPhaseDto {
  focus = 'focus',
  short_break = 'short_break',
  long_break = 'long_break'
}

export class RecordFocusSessionDto {
  @IsEnum(FocusPhaseDto, { message: '阶段类型不正确' })
  phase!: FocusPhaseDto;

  @IsInt({ message: '时长格式不正确' })
  @Min(1, { message: '时长必须大于 0' })
  durationSec!: number;

  @IsString({ message: '开始时间格式不正确' })
  startedAt!: string;

  @IsString({ message: '结束时间格式不正确' })
  endedAt!: string;

  @IsBoolean({ message: '完成状态格式不正确' })
  completed!: boolean;

  @IsOptional()
  @IsBoolean({ message: '中断状态格式不正确' })
  interrupted?: boolean;

  @IsInt({ message: '实际时长格式不正确' })
  @Min(0, { message: '实际时长不能小于 0' })
  actualDurationSec!: number;

  @IsOptional()
  @IsString({ message: '客户端事件 ID 格式不正确' })
  @MaxLength(120, { message: '客户端事件 ID 长度不能超过 120' })
  clientEventId?: string;
}
