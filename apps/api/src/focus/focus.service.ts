import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { FocusPhase } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { formatStandardDateTime } from '../common/time.util';

import { RecordFocusSessionDto } from './record-focus-session.dto';

@Injectable()
export class FocusService {
  constructor(private readonly prisma: PrismaService) {}

  async recordSession(userId: string, dto: RecordFocusSessionDto) {
    const clientEventId = dto.clientEventId?.trim() || randomUUID();

    const duplicated = await this.prisma.focusSession.findUnique({
      where: {
        userId_clientEventId: {
          userId,
          clientEventId
        }
      }
    });

    if (duplicated) {
      return {
        deduplicated: true,
        id: duplicated.id,
        phase: duplicated.phase,
        durationSec: duplicated.durationSec,
        completed: duplicated.completed,
        actualDurationSec: duplicated.actualDurationSec,
        createdAt: formatStandardDateTime(duplicated.createdAt)
      };
    }

    const startedAt = new Date(dto.startedAt);
    const endedAt = new Date(dto.endedAt);

    const created = await this.prisma.focusSession.create({
      data: {
        userId,
        clientEventId,
        phase: dto.phase as FocusPhase,
        durationSec: dto.durationSec,
        startedAt,
        endedAt,
        completed: dto.completed,
        interrupted: dto.interrupted ?? false,
        actualDurationSec: dto.actualDurationSec
      }
    });

    return {
      deduplicated: false,
      id: created.id,
      phase: created.phase,
      durationSec: created.durationSec,
      completed: created.completed,
      actualDurationSec: created.actualDurationSec,
      createdAt: formatStandardDateTime(created.createdAt)
    };
  }

  async getStats(userId: string) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const weekStart = new Date(todayStart);
    const dayOfWeek = weekStart.getDay() === 0 ? 6 : weekStart.getDay() - 1;
    weekStart.setDate(weekStart.getDate() - dayOfWeek);
    const nextWeekStart = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [todaySessions, weekSessions, totalSessions] = await Promise.all([
      this.prisma.focusSession.findMany({
        where: {
          userId,
          phase: 'focus',
          startedAt: {
            gte: todayStart,
            lt: tomorrowStart
          }
        }
      }),
      this.prisma.focusSession.findMany({
        where: {
          userId,
          phase: 'focus',
          startedAt: {
            gte: weekStart,
            lt: nextWeekStart
          }
        }
      }),
      this.prisma.focusSession.aggregate({
        where: {
          userId,
          phase: 'focus',
          completed: true
        },
        _count: { id: true },
        _sum: { actualDurationSec: true }
      })
    ]);

    const todayCompletedCount = todaySessions.filter((s) => s.completed).length;
    const todayTotalSec = todaySessions
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + s.actualDurationSec, 0);

    const weekCompletedCount = weekSessions.filter((s) => s.completed).length;
    const weekTotalSec = weekSessions
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + s.actualDurationSec, 0);

    const weekDailyBreakdown: Array<{ date: string; count: number; durationSec: number }> = [];
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const daySessions = weekSessions.filter(
        (s) => s.startedAt >= dayStart && s.startedAt < dayEnd && s.completed
      );
      weekDailyBreakdown.push({
        date: dayStart.toISOString().slice(0, 10),
        count: daySessions.length,
        durationSec: daySessions.reduce((sum, s) => sum + s.actualDurationSec, 0)
      });
    }

    return {
      today: {
        completedCount: todayCompletedCount,
        totalDurationSec: todayTotalSec
      },
      week: {
        completedCount: weekCompletedCount,
        totalDurationSec: weekTotalSec,
        dailyBreakdown: weekDailyBreakdown
      },
      total: {
        completedCount: totalSessions._count.id ?? 0,
        totalDurationSec: totalSessions._sum.actualDurationSec ?? 0
      }
    };
  }
}
