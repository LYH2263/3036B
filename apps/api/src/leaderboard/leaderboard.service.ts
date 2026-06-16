import { Injectable } from '@nestjs/common';

import type {
  LeaderboardDimension,
  LeaderboardDto,
  LeaderboardEntryDto,
  LeaderboardPeriod
} from '@lexigram/shared';

import { PrismaService } from '../prisma/prisma.service';
import { GetLeaderboardDto } from './get-leaderboard.dto';

interface RawAggregate {
  userId: string;
  email: string;
  nickname: string | null;
  avatarColor: string | null;
  value: number;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(
    currentUserId: string,
    query: GetLeaderboardDto
  ): Promise<LeaderboardDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const timeBoundaries = this.computeTimeBoundaries(
      query.period,
      query.timezoneOffsetMinutes ?? 0
    );

    const rawData = await this.aggregateByDimension(
      query.dimension,
      query.period,
      timeBoundaries
    );

    const sorted = rawData.sort((a, b) => b.value - a.value);

    const ranked = this.assignRanksWithTies(sorted);

    const total = ranked.length;
    const pagedEntries = ranked.slice(skip, skip + pageSize);

    const currentUserEntry =
      ranked.find((e) => e.userId === currentUserId) ?? null;

    const anonymize = (userId: string) => userId !== currentUserId;

    const entries: LeaderboardEntryDto[] = pagedEntries.map((e) => ({
      rank: e.rank,
      isTied: e.isTied,
      userId: e.userId,
      displayName: anonymize(e.userId)
        ? this.anonymizeDisplayName(e.nickname, e.email)
        : (e.nickname ?? e.email),
      avatarColor: e.avatarColor,
      value: e.value,
      isCurrentUser: e.userId === currentUserId
    }));

    const currentUserMapped: LeaderboardEntryDto | null = currentUserEntry
      ? {
          rank: currentUserEntry.rank,
          isTied: currentUserEntry.isTied,
          userId: currentUserEntry.userId,
          displayName:
            currentUserEntry.nickname ?? currentUserEntry.email,
          avatarColor: currentUserEntry.avatarColor,
          value: currentUserEntry.value,
          isCurrentUser: true
        }
      : null;

    return {
      dimension: query.dimension,
      period: query.period,
      total,
      entries,
      currentUserEntry: currentUserMapped,
      page,
      pageSize,
      hasMore: skip + pageSize < total
    };
  }

  private computeTimeBoundaries(
    period: LeaderboardPeriod,
    timezoneOffsetMinutes: number
  ): { start: Date | null; end: Date | null } {
    if (period === 'all') {
      return { start: null, end: null };
    }

    const now = new Date();
    const localNow = new Date(now.getTime() + timezoneOffsetMinutes * 60 * 1000);

    const localDay = new Date(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate()
    );

    const dayOfWeek = localDay.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const localWeekStart = new Date(localDay);
    localWeekStart.setUTCDate(localDay.getUTCDate() - diffToMonday);
    localWeekStart.setUTCHours(0, 0, 0, 0);

    const localWeekEnd = new Date(localWeekStart);
    localWeekEnd.setUTCDate(localWeekStart.getUTCDate() + 7);

    const utcWeekStart = new Date(
      localWeekStart.getTime() - timezoneOffsetMinutes * 60 * 1000
    );
    const utcWeekEnd = new Date(
      localWeekEnd.getTime() - timezoneOffsetMinutes * 60 * 1000
    );

    return { start: utcWeekStart, end: utcWeekEnd };
  }

  private async aggregateByDimension(
    dimension: LeaderboardDimension,
    period: LeaderboardPeriod,
    boundaries: { start: Date | null; end: Date | null }
  ): Promise<RawAggregate[]> {
    switch (dimension) {
      case 'weekly_reviews':
        return this.aggregateWeeklyReviews(period, boundaries);
      case 'streak_days':
        return this.aggregateStreakDays();
      case 'grammar_accuracy':
        return this.aggregateGrammarAccuracy(period, boundaries);
      case 'vocabulary_count':
        return this.aggregateVocabularyCount(period, boundaries);
      default:
        return [];
    }
  }

  private async aggregateWeeklyReviews(
    period: LeaderboardPeriod,
    boundaries: { start: Date | null; end: Date | null }
  ): Promise<RawAggregate[]> {
    const where: Record<string, unknown> = {};
    if (period === 'week' && boundaries.start && boundaries.end) {
      where['reviewedAt'] = {
        gte: boundaries.start,
        lt: boundaries.end
      };
    }

    const result = await this.prisma.userWordReviewEvent.groupBy({
      by: ['userId'],
      _count: { id: true },
      where
    });

    const userIds = result.map((r) => r.userId);
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarColor: true
      }
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return result
      .filter((r) => r._count.id > 0)
      .map((r) => {
        const u = userMap.get(r.userId)!;
        return {
          userId: r.userId,
          email: u.email,
          nickname: u.nickname,
          avatarColor: u.avatarColor,
          value: r._count.id
        };
      });
  }

  private async aggregateStreakDays(): Promise<RawAggregate[]> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarColor: true,
        wordReviewEvents: {
          select: { reviewedAt: true },
          take: 365,
          orderBy: { reviewedAt: 'desc' }
        },
        grammarAttempts: {
          select: { createdAt: true },
          take: 365,
          orderBy: { createdAt: 'desc' }
        },
        wordProgresses: {
          select: { createdAt: true },
          take: 365,
          orderBy: { createdAt: 'desc' }
        },
        dictationAttempts: {
          select: { createdAt: true },
          take: 365,
          orderBy: { createdAt: 'desc' }
        },
        speakingAttempts: {
          select: { createdAt: true },
          take: 365,
          orderBy: { createdAt: 'desc' }
        },
        clozeAttempts: {
          select: { createdAt: true },
          take: 365,
          orderBy: { createdAt: 'desc' }
        },
        focusSessions: {
          select: { startedAt: true },
          where: { phase: 'focus', completed: true },
          take: 365,
          orderBy: { startedAt: 'desc' }
        }
      }
    });

    const toDayKey = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().slice(0, 10);
    };

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    return users
      .map((u) => {
        const daySet = new Set<string>();

        u.wordReviewEvents.forEach((e) => daySet.add(toDayKey(e.reviewedAt)));
        u.grammarAttempts.forEach((e) => daySet.add(toDayKey(e.createdAt)));
        u.wordProgresses.forEach((e) => daySet.add(toDayKey(e.createdAt)));
        u.dictationAttempts.forEach((e) => daySet.add(toDayKey(e.createdAt)));
        u.speakingAttempts.forEach((e) => daySet.add(toDayKey(e.createdAt)));
        u.clozeAttempts.forEach((e) => daySet.add(toDayKey(e.createdAt)));
        u.focusSessions.forEach((e) => daySet.add(toDayKey(e.startedAt)));

        let streak = 0;
        const cursor = new Date(todayStart);

        while (true) {
          const key = cursor.toISOString().slice(0, 10);
          if (!daySet.has(key)) break;
          streak += 1;
          cursor.setTime(cursor.getTime() - 24 * 60 * 60 * 1000);
        }

        return {
          userId: u.id,
          email: u.email,
          nickname: u.nickname,
          avatarColor: u.avatarColor,
          value: streak
        };
      })
      .filter((r) => r.value > 0);
  }

  private async aggregateGrammarAccuracy(
    period: LeaderboardPeriod,
    boundaries: { start: Date | null; end: Date | null }
  ): Promise<RawAggregate[]> {
    const where: Record<string, unknown> = {};
    if (period === 'week' && boundaries.start && boundaries.end) {
      where['createdAt'] = {
        gte: boundaries.start,
        lt: boundaries.end
      };
    }

    const result = await this.prisma.grammarAttempt.groupBy({
      by: ['userId'],
      _sum: {
        correctCount: true,
        totalQuestions: true
      },
      _count: { id: true },
      where
    });

    const userIds = result
      .filter(
        (r) =>
          (r._sum.totalQuestions ?? 0) >= 5 &&
          r._count.id >= 1
      )
      .map((r) => r.userId);

    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarColor: true
      }
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return result
      .filter(
        (r) =>
          (r._sum.totalQuestions ?? 0) >= 5 &&
          (r._sum.totalQuestions ?? 0) > 0
      )
      .map((r) => {
        const u = userMap.get(r.userId)!;
        const total = r._sum.totalQuestions ?? 0;
        const correct = r._sum.correctCount ?? 0;
        const accuracy = total > 0 ? Number(((correct / total) * 100).toFixed(2)) : 0;
        return {
          userId: r.userId,
          email: u.email,
          nickname: u.nickname,
          avatarColor: u.avatarColor,
          value: accuracy
        };
      });
  }

  private async aggregateVocabularyCount(
    period: LeaderboardPeriod,
    boundaries: { start: Date | null; end: Date | null }
  ): Promise<RawAggregate[]> {
    const where: Record<string, unknown> = {};
    if (period === 'week' && boundaries.start && boundaries.end) {
      where['createdAt'] = {
        gte: boundaries.start,
        lt: boundaries.end
      };
    }

    const result = await this.prisma.userWordProgress.groupBy({
      by: ['userId'],
      _count: { id: true },
      where
    });

    const userIds = result.map((r) => r.userId);
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarColor: true
      }
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return result
      .filter((r) => r._count.id > 0)
      .map((r) => {
        const u = userMap.get(r.userId)!;
        return {
          userId: r.userId,
          email: u.email,
          nickname: u.nickname,
          avatarColor: u.avatarColor,
          value: r._count.id
        };
      });
  }

  private assignRanksWithTies(
    sorted: RawAggregate[]
  ): Array<RawAggregate & { rank: number; isTied: boolean }> {
    const result: Array<RawAggregate & { rank: number; isTied: boolean }> = [];
    let i = 0;

    while (i < sorted.length) {
      const currentValue = sorted[i].value;
      let j = i;

      while (j < sorted.length && sorted[j].value === currentValue) {
        j++;
      }

      const rank = i + 1;
      const isTied = j - i > 1;

      for (let k = i; k < j; k++) {
        result.push({
          ...sorted[k],
          rank,
          isTied
        });
      }

      i = j;
    }

    return result;
  }

  private anonymizeDisplayName(
    nickname: string | null,
    email: string
  ): string {
    if (nickname) {
      if (nickname.length <= 2) {
        return nickname.charAt(0) + '*';
      }
      return nickname.charAt(0) + '*'.repeat(nickname.length - 2) + nickname.charAt(nickname.length - 1);
    }

    const atIndex = email.indexOf('@');
    if (atIndex === -1) {
      return email.charAt(0) + '***';
    }

    const localPart = email.slice(0, atIndex);
    const domain = email.slice(atIndex);

    if (localPart.length <= 2) {
      return localPart.charAt(0) + '***' + domain;
    }

    return (
      localPart.charAt(0) +
      '*'.repeat(localPart.length - 2) +
      localPart.charAt(localPart.length - 1) +
      domain
    );
  }
}
