import { IsInt, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

import { LeaderboardDimension, LeaderboardPeriod } from '@lexigram/shared';

export class GetLeaderboardDto {
  @IsEnum(['weekly_reviews', 'streak_days', 'grammar_accuracy', 'vocabulary_count'])
  dimension: LeaderboardDimension;

  @IsEnum(['week', 'all'])
  period: LeaderboardPeriod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timezoneOffsetMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
