import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { formatStandardDateTime } from '../common/time.util';

function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  let state = hash >>> 0;

  return function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function getDateKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class DailyWordService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodayWord(userId: string, timezoneOffsetMinutes?: number) {
    const now = new Date();
    const offset = timezoneOffsetMinutes ?? -new Date().getTimezoneOffset();
    const localDate = new Date(now.getTime() + offset * 60 * 1000);
    const dateKey = getDateKey(localDate);
    const dateStart = new Date(`${dateKey}T00:00:00.000Z`);

    const existing = await this.prisma.dailyWord.findUnique({
      where: {
        userId_date: {
          userId,
          date: dateStart
        }
      },
      include: {
        wordEntry: true
      }
    });

    if (existing) {
      return this.mapDailyWord(existing);
    }

    const selectedWord = await this.selectDailyWord(userId, dateKey);

    if (!selectedWord) {
      throw new NotFoundException({
        message: '词库中没有可用单词',
        errorCode: 'NO_WORDS_AVAILABLE'
      });
    }

    try {
      const dailyWord = await this.prisma.dailyWord.create({
        data: {
          userId,
          wordEntryId: selectedWord.id,
          date: dateStart
        },
        include: {
          wordEntry: true
        }
      });

      return this.mapDailyWord(dailyWord);
    } catch (_error) {
      const fallback = await this.prisma.dailyWord.findUnique({
        where: {
          userId_date: {
            userId,
            date: dateStart
          }
        },
        include: {
          wordEntry: true
        }
      });

      if (fallback) {
        return this.mapDailyWord(fallback);
      }

      throw _error;
    }
  }

  private async selectDailyWord(userId: string, dateKey: string) {
    const learnedWordIds = await this.prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordEntryId: true }
    });

    const learnedIdSet = new Set(learnedWordIds.map((item) => item.wordEntryId));

    const allWords = await this.prisma.wordEntry.findMany({
      select: { id: true, word: true }
    });

    if (allWords.length === 0) {
      return null;
    }

    const unlearnedWords = allWords.filter((w) => !learnedIdSet.has(w.id));

    const seed = `${userId}-${dateKey}`;
    const random = seededRandom(seed);

    if (unlearnedWords.length > 0) {
      const index = Math.floor(random() * unlearnedWords.length);
      const selected = unlearnedWords[index];
      return this.prisma.wordEntry.findUnique({ where: { id: selected.id } });
    }

    const pastDailyWords = await this.prisma.dailyWord.findMany({
      where: { userId },
      select: { wordEntryId: true, date: true },
      orderBy: { date: 'desc' }
    });

    const pastWordIdSet = new Set(pastDailyWords.map((item) => item.wordEntryId));
    const unusedWords = allWords.filter((w) => !pastWordIdSet.has(w.id));

    if (unusedWords.length > 0) {
      const index = Math.floor(random() * unusedWords.length);
      const selected = unusedWords[index];
      return this.prisma.wordEntry.findUnique({ where: { id: selected.id } });
    }

    const index = Math.floor(random() * allWords.length);
    const selected = allWords[index];
    return this.prisma.wordEntry.findUnique({ where: { id: selected.id } });
  }

  async markLearned(userId: string, date?: string) {
    const now = new Date();
    const targetDate = date ? new Date(`${date}T00:00:00.000Z`) : this.getTodayStart();

    const dailyWord = await this.prisma.dailyWord.findUnique({
      where: {
        userId_date: {
          userId,
          date: targetDate
        }
      },
      include: { wordEntry: true }
    });

    if (!dailyWord) {
      throw new NotFoundException({
        message: '当日每日一词不存在',
        errorCode: 'DAILY_WORD_NOT_FOUND'
      });
    }

    const updated = await this.prisma.dailyWord.update({
      where: { id: dailyWord.id },
      data: { learned: true },
      include: { wordEntry: true }
    });

    return this.mapDailyWord(updated);
  }

  async getHistory(userId: string, days: number = 7) {
    const todayStart = this.getTodayStart();
    const startDate = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const items = await this.prisma.dailyWord.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: todayStart
        }
      },
      include: {
        wordEntry: true
      },
      orderBy: { date: 'desc' }
    });

    const total = await this.prisma.dailyWord.count({
      where: { userId }
    });

    const historyMap = new Map<string, Prisma.DailyWordGetPayload<{ include: { wordEntry: true } }>>();
    items.forEach((item) => {
      const key = getDateKey(item.date);
      historyMap.set(key, item);
    });

    const result: Array<ReturnType<typeof this.mapDailyWord> | null> = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const key = getDateKey(date);
      const item = historyMap.get(key);
      result.push(item ? this.mapDailyWord(item) : null);
    }

    return {
      items: result.filter((item): item is NonNullable<typeof item> => item !== null),
      total
    };
  }

  private getTodayStart(): Date {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    return todayStart;
  }

  private mapDailyWord(
    item: Prisma.DailyWordGetPayload<{
      include: {
        wordEntry: true;
      };
    }>
  ) {
    return {
      id: item.id,
      date: formatStandardDateTime(item.date).slice(0, 10),
      learned: item.learned,
      word: {
        id: item.wordEntry.id,
        word: item.wordEntry.word,
        definition: item.wordEntry.definition,
        exampleSentence: item.wordEntry.exampleSentence,
        phonetic: item.wordEntry.phonetic,
        etymology: item.wordEntry.etymology
      }
    };
  }
}
