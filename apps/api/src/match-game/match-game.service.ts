import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { formatStandardDateTime } from '../common/time.util';

import { GetMatchGameWordsDto } from './get-match-game-words.dto';
import { SubmitMatchGameDto } from './submit-match-game.dto';

const DIFFICULTY_CONFIG: Record<string, { defaultCount: number; defaultTimeSec: number }> = {
  easy: { defaultCount: 6, defaultTimeSec: 120 },
  normal: { defaultCount: 10, defaultTimeSec: 90 },
  hard: { defaultCount: 15, defaultTimeSec: 60 }
};

@Injectable()
export class MatchGameService {
  constructor(private readonly prisma: PrismaService) {}

  async getWords(userId: string, dto: GetMatchGameWordsDto) {
    const difficulty = dto.difficulty ?? 'normal';
    const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.normal;
    const count = dto.count ?? config.defaultCount;

    const userWords = await this.selectFromUserWords(userId, count);

    if (userWords.length < count) {
      const bankWords = await this.selectFromWordBank(
        userId,
        count - userWords.length,
        userWords.map((w) => w.id)
      );
      userWords.push(...bankWords);
    }

    const shuffled = this.shuffleArray(userWords).slice(0, count);

    return shuffled.map((w) => ({
      id: w.id,
      word: w.word,
      definition: w.definition
    }));
  }

  async submitAttempt(userId: string, dto: SubmitMatchGameDto) {
    const clientEventId = dto.clientEventId?.trim() || randomUUID();

    const duplicated = await this.prisma.matchGameAttempt.findUnique({
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
        score: duplicated.score,
        maxCombo: duplicated.maxCombo,
        matchedCount: duplicated.matchedCount,
        totalWords: duplicated.totalWords,
        timeUsedSec: duplicated.timeUsedSec,
        won: duplicated.won,
        createdAt: formatStandardDateTime(duplicated.createdAt)
      };
    }

    const created = await this.prisma.matchGameAttempt.create({
      data: {
        userId,
        clientEventId,
        difficulty: dto.difficulty ?? 'normal',
        wordCount: dto.wordCount,
        timeLimitSec: dto.timeLimitSec,
        score: dto.score,
        maxCombo: dto.maxCombo,
        matchedCount: dto.matchedCount,
        totalWords: dto.totalWords,
        timeUsedSec: dto.timeUsedSec,
        won: dto.won
      }
    });

    return {
      deduplicated: false,
      id: created.id,
      score: created.score,
      maxCombo: created.maxCombo,
      matchedCount: created.matchedCount,
      totalWords: created.totalWords,
      timeUsedSec: created.timeUsedSec,
      won: created.won,
      createdAt: formatStandardDateTime(created.createdAt)
    };
  }

  async getBestScore(userId: string, difficulty: string) {
    const attempts = await this.prisma.matchGameAttempt.findMany({
      where: { userId, difficulty },
      orderBy: { score: 'desc' }
    });

    const wins = attempts.filter((a) => a.won);
    const bestScore = attempts.length > 0 ? attempts[0].score : 0;
    const bestCombo = attempts.length > 0 ? Math.max(...attempts.map((a) => a.maxCombo)) : 0;

    return {
      difficulty,
      bestScore,
      bestCombo,
      totalGames: attempts.length,
      totalWins: wins.length
    };
  }

  private async selectFromUserWords(userId: string, count: number) {
    const progresses = await this.prisma.userWordProgress.findMany({
      where: { userId },
      include: { wordEntry: true },
      orderBy: { lastReviewedAt: { sort: 'asc', nulls: 'first' } }
    });

    const shuffled = this.shuffleArray(progresses).slice(0, count);
    return shuffled.map((p) => ({
      id: p.wordEntry.id,
      word: p.wordEntry.word,
      definition: p.wordEntry.definition
    }));
  }

  private async selectFromWordBank(userId: string, count: number, excludeIds: string[] = []) {
    const userWordEntryIds = await this.prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordEntryId: true }
    });
    const excludeSet = new Set([...excludeIds, ...userWordEntryIds.map((p) => p.wordEntryId)]);

    const totalAvailable = await this.prisma.wordEntry.count();
    const skip = Math.max(0, Math.floor(Math.random() * Math.max(1, totalAvailable - count * 2)));

    const entries = await this.prisma.wordEntry.findMany({
      skip,
      take: count * 3,
      orderBy: { word: 'asc' }
    });

    const filtered = entries.filter((e) => !excludeSet.has(e.id));
    return this.shuffleArray(filtered).slice(0, count).map((e) => ({
      id: e.id,
      word: e.word,
      definition: e.definition
    }));
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
