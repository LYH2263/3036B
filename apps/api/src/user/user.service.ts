import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { formatStandardDateTime } from '../common/time.util';

import type {
  UserProfileDto,
  UserPreferencesDto
} from '@lexigram/shared';
import { UpdateProfileDto } from './update-profile.dto';
import { UpdatePreferencesDto } from './update-preferences.dto';

const WEAK_PASSWORD_PATTERNS = [
  /^123456/,
  /^password/i,
  /^qwerty/i,
  /^abc123/i,
  /^111111/,
  /^000000/
];

const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899'
];

function pickAvatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < 6) {
    return { valid: false, message: '密码长度至少 6 位' };
  }
  if (password.length > 64) {
    return { valid: false, message: '密码长度不能超过 64 位' };
  }
  for (const pattern of WEAK_PASSWORD_PATTERNS) {
    if (pattern.test(password)) {
      return { valid: false, message: '密码强度太弱，请使用更复杂的密码' };
    }
  }
  return { valid: true };
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException({
        message: '用户不存在',
        errorCode: 'USER_NOT_FOUND'
      });
    }

    return this.buildProfileDto(user);
  }

  async getPreferences(userId: string): Promise<UserPreferencesDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException({
        message: '用户不存在',
        errorCode: 'USER_NOT_FOUND'
      });
    }

    return {
      defaultAccent: user.defaultAccent,
      dailyGoal: user.dailyGoal,
      reviewReminderEnabled: user.reviewReminderEnabled
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileDto> {
    const data: Record<string, unknown> = {};

    if (dto.nickname !== undefined) {
      const trimmed = dto.nickname.trim();
      if (trimmed.length === 0) {
        data.nickname = null;
      } else if (trimmed.length > 32) {
        throw new BadRequestException({
          message: '昵称长度不能超过 32 个字符',
          errorCode: 'NICKNAME_TOO_LONG'
        });
      } else {
        data.nickname = trimmed;
      }
    }

    if (dto.avatarColor !== undefined) {
      if (dto.avatarColor.length === 0) {
        data.avatarColor = null;
      } else {
        data.avatarColor = dto.avatarColor;
      }
    }

    if (Object.keys(data).length === 0) {
      return this.getProfile(userId);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data
    });

    return this.buildProfileDto(user);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<UserPreferencesDto> {
    const data: Record<string, unknown> = {};

    if (dto.defaultAccent !== undefined) {
      const allowedAccents = ['en-US', 'en-GB', 'en-AU'];
      if (!allowedAccents.includes(dto.defaultAccent)) {
        throw new BadRequestException({
          message: '不支持的发音口音',
          errorCode: 'INVALID_ACCENT'
        });
      }
      data.defaultAccent = dto.defaultAccent;
    }

    if (dto.dailyGoal !== undefined) {
      if (dto.dailyGoal < 1 || dto.dailyGoal > 200) {
        throw new BadRequestException({
          message: '每日目标需在 1-200 之间',
          errorCode: 'INVALID_DAILY_GOAL'
        });
      }
      data.dailyGoal = dto.dailyGoal;
    }

    if (dto.reviewReminderEnabled !== undefined) {
      data.reviewReminderEnabled = dto.reviewReminderEnabled;
    }

    if (Object.keys(data).length === 0) {
      return this.getPreferences(userId);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data
    });

    return {
      defaultAccent: user.defaultAccent,
      dailyGoal: user.dailyGoal,
      reviewReminderEnabled: user.reviewReminderEnabled
    };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException({
        message: '用户不存在',
        errorCode: 'USER_NOT_FOUND'
      });
    }

    const matched = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!matched) {
      throw new BadRequestException({
        message: '旧密码错误',
        errorCode: 'OLD_PASSWORD_INCORRECT'
      });
    }

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      throw new BadRequestException({
        message: strengthCheck.message,
        errorCode: 'WEAK_PASSWORD'
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash }
    });
  }

  private buildProfileDto(user: User): UserProfileDto {
    const avatarColor = user.avatarColor ?? pickAvatarColor(user.email);
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      avatarColor,
      createdAt: formatStandardDateTime(user.createdAt)
    };
  }
}
