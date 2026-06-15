import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { formatStandardDateTime } from '../common/time.util';

import { GetSpeakingItemsDto } from './get-speaking-items.dto';
import { SubmitSpeakingDto } from './submit-speaking.dto';

@Injectable()
export class SpeakingService {
  constructor(private readonly prisma: PrismaService) {}

  async getItems(userId: string, dto: GetSpeakingItemsDto) {
    const count = dto.count ?? 10;
    const source = dto.source ?? 'mixed';
    const mode = dto.mode ?? 'word';

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
      wordEntryId: w.id,
      text: mode === 'sentence' && w.exampleSentence ? w.exampleSentence : w.word,
      definition: w.definition,
      phonetic: w.phonetic,
      mode
    }));
  }

  async submitAttempt(userId: string, dto: SubmitSpeakingDto) {
    const clientEventId = dto.clientEventId?.trim() || randomUUID();

    const duplicated = await this.prisma.speakingAttempt.findUnique({
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
        targetText: duplicated.targetText,
        recognizedText: duplicated.recognizedText,
        similarityScore: duplicated.similarityScore,
        totalWords: duplicated.totalWords,
        correctCount: duplicated.correctCount,
        wordResults: duplicated.wordResults as unknown as Array<{
          word: string;
          recognized: string;
          matchType: 'correct' | 'wrong' | 'missing' | 'extra';
          similarity: number;
        }>,
        practiceMode: duplicated.practiceMode as 'word' | 'sentence',
        createdAt: formatStandardDateTime(duplicated.createdAt)
      };
    }

    const created = await this.prisma.speakingAttempt.create({
      data: {
        userId,
        clientEventId,
        wordEntryId: dto.wordEntryId || null,
        targetText: dto.targetText,
        recognizedText: dto.recognizedText,
        similarityScore: dto.similarityScore,
        wordResults: dto.wordResults as unknown as Prisma.InputJsonValue,
        totalWords: dto.totalWords,
        correctCount: dto.correctCount,
        practiceMode: dto.practiceMode
      }
    });

    return {
      deduplicated: false,
      id: created.id,
      targetText: created.targetText,
      recognizedText: created.recognizedText,
      similarityScore: created.similarityScore,
      totalWords: created.totalWords,
      correctCount: created.correctCount,
      wordResults: created.wordResults as unknown as Array<{
        word: string;
        recognized: string;
        matchType: 'correct' | 'wrong' | 'missing' | 'extra';
        similarity: number;
      }>,
      practiceMode: created.practiceMode as 'word' | 'sentence',
      createdAt: formatStandardDateTime(created.createdAt)
    };
  }

  async getBestScore(userId: string, practiceMode: string) {
    const attempts = await this.prisma.speakingAttempt.findMany({
      where: {
        userId,
        practiceMode
      },
      select: {
        similarityScore: true,
        createdAt: true
      },
      orderBy: { similarityScore: 'desc' },
      take: 1
    });

    const stats = await this.prisma.speakingAttempt.aggregate({
      where: {
        userId,
        practiceMode
      },
      _count: { id: true },
      _avg: { similarityScore: true }
    });

    return {
      practiceMode,
      bestScore: attempts.length > 0 ? attempts[0].similarityScore : 0,
      totalAttempts: stats._count.id,
      averageScore: Number((stats._avg.similarityScore ?? 0).toFixed(2))
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
