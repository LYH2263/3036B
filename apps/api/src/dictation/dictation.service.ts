import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { formatStandardDateTime } from '../common/time.util';

import { GetDictationWordsDto } from './get-dictation-words.dto';
import { SubmitDictationDto } from './submit-dictation.dto';

@Injectable()
export class DictationService {
  constructor(private readonly prisma: PrismaService) {}

  async getWords(userId: string, dto: GetDictationWordsDto) {
    const count = dto.count ?? 10;
    const source = dto.source ?? 'mixed';

    let words: Array<{
      id: string;
      word: string;
      definition: string;
      exampleSentence: string;
      phonetic: string;
    }>;

    if (source === 'user-words') {
      words = await this.selectFromUserWords(userId, count);
    } else if (source === 'word-bank') {
      words = await this.selectFromWordBank(userId, count);
    } else {
      const userWords = await this.selectFromUserWords(userId, Math.ceil(count / 2));
      const bankWords = await this.selectFromWordBank(
        userId,
        count - userWords.length,
        userWords.map((w) => w.id)
      );
      words = [...userWords, ...bankWords];

      words = this.shuffleArray(words).slice(0, count);
    }

    return words.map((w) => ({
      id: w.id,
      word: w.word,
      definition: w.definition,
      exampleSentence: w.exampleSentence,
      phonetic: w.phonetic
    }));
  }

  async submitAttempt(userId: string, dto: SubmitDictationDto) {
    const totalWords = dto.wordResults.length;
    const correctCount = dto.wordResults.filter((r) => r.correct).length;
    const accuracy = totalWords > 0 ? Number(((correctCount / totalWords) * 100).toFixed(2)) : 0;

    const clientEventId = dto.clientEventId?.trim() || randomUUID();

    const duplicated = await this.prisma.dictationAttempt.findUnique({
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
        totalWords: duplicated.totalWords,
        correctCount: duplicated.correctCount,
        accuracy: duplicated.accuracy,
        createdAt: formatStandardDateTime(duplicated.createdAt)
      };
    }

    const created = await this.prisma.dictationAttempt.create({
      data: {
        userId,
        clientEventId,
        totalWords,
        correctCount,
        accuracy,
        wordResults: dto.wordResults as unknown as Prisma.InputJsonValue
      }
    });

    return {
      deduplicated: false,
      id: created.id,
      totalWords: created.totalWords,
      correctCount: created.correctCount,
      accuracy: created.accuracy,
      createdAt: formatStandardDateTime(created.createdAt)
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
      definition: p.wordEntry.definition,
      exampleSentence: p.wordEntry.exampleSentence,
      phonetic: p.wordEntry.phonetic
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
      definition: e.definition,
      exampleSentence: e.exampleSentence,
      phonetic: e.phonetic
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
