import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { formatStandardDateTime } from '../common/time.util';

import { GetClozeItemsDto } from './get-cloze-items.dto';
import { SubmitClozeDto } from './submit-cloze.dto';

interface WordWithExample {
  id: string;
  word: string;
  definition: string;
  exampleSentence: string;
  phonetic: string;
}

interface ClozeItem {
  id: string;
  wordEntryId: string;
  targetWord: string;
  definition: string;
  sentenceWithBlank: string;
  fullSentence: string;
  blankIndex: number;
}

@Injectable()
export class ClozeService {
  constructor(private readonly prisma: PrismaService) {}

  async getItems(userId: string, dto: GetClozeItemsDto) {
    const count = dto.count ?? 10;
    const source = dto.source ?? 'user-words';

    let words: WordWithExample[];

    if (source === 'word-bank') {
      words = await this.selectFromWordBank(userId, count);
    } else if (source === 'mixed') {
      const userWords = await this.selectFromUserWords(userId, Math.ceil(count / 2));
      const bankWords = await this.selectFromWordBank(
        userId,
        count - userWords.length,
        userWords.map((w) => w.id)
      );
      words = [...userWords, ...bankWords];
      words = this.shuffleArray(words).slice(0, count);
    } else {
      words = await this.selectFromUserWords(userId, count);
    }

    if (words.length === 0) {
      throw new NotFoundException('没有可用的单词，请先添加一些单词到生词本');
    }

    const clozeItems: ClozeItem[] = [];

    for (const word of words) {
      const clozeItem = this.createClozeItem(word);
      if (clozeItem) {
        clozeItems.push(clozeItem);
      }
    }

    if (clozeItems.length === 0) {
      throw new NotFoundException('所选单词均无有效例句，请稍后重试');
    }

    return clozeItems;
  }

  async submitAttempt(userId: string, dto: SubmitClozeDto) {
    const clientEventId = dto.clientEventId?.trim() || randomUUID();

    const duplicated = await this.prisma.clozeAttempt.findUnique({
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
        wordEntryId: duplicated.wordEntryId,
        targetWord: duplicated.targetWord,
        sentence: duplicated.sentence,
        userAnswer: duplicated.userAnswer,
        correct: duplicated.correct,
        usedHint: duplicated.usedHint,
        skipped: duplicated.skipped,
        totalQuestions: duplicated.totalQuestions,
        correctCount: duplicated.correctCount,
        accuracy: duplicated.accuracy,
        createdAt: formatStandardDateTime(duplicated.createdAt)
      };
    }

    const created = await this.prisma.clozeAttempt.create({
      data: {
        userId,
        clientEventId,
        wordEntryId: dto.wordEntryId,
        targetWord: dto.targetWord,
        sentence: dto.sentence,
        userAnswer: dto.userAnswer,
        correct: dto.correct,
        usedHint: dto.usedHint,
        skipped: dto.skipped,
        totalQuestions: dto.totalQuestions,
        correctCount: dto.correctCount,
        accuracy: dto.accuracy
      }
    });

    return {
      deduplicated: false,
      id: created.id,
      wordEntryId: created.wordEntryId,
      targetWord: created.targetWord,
      sentence: created.sentence,
      userAnswer: created.userAnswer,
      correct: created.correct,
      usedHint: created.usedHint,
      skipped: created.skipped,
      totalQuestions: created.totalQuestions,
      correctCount: created.correctCount,
      accuracy: created.accuracy,
      createdAt: formatStandardDateTime(created.createdAt)
    };
  }

  async getStats(userId: string) {
    const stats = await this.prisma.clozeAttempt.aggregate({
      where: {
        userId,
        skipped: false
      },
      _count: { id: true },
      _sum: {
        totalQuestions: true,
        correctCount: true
      }
    });

    const totalAttempts = stats._count.id;
    const totalQuestions = stats._sum.totalQuestions ?? 0;
    const correctCount = stats._sum.correctCount ?? 0;
    const accuracy =
      totalQuestions > 0
        ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
        : 0;

    return {
      totalAttempts,
      totalQuestions,
      correctCount,
      accuracy
    };
  }

  private createClozeItem(word: WordWithExample): ClozeItem | null {
    const { id, word: targetWord, definition, exampleSentence } = word;

    if (!exampleSentence || exampleSentence.trim().length === 0) {
      return null;
    }

    const normalizedSentence = exampleSentence;
    const normalizedWord = targetWord.toLowerCase();

    const wordRegex = new RegExp(`\\b${this.escapeRegex(targetWord)}\\b`, 'gi');
    const matches: Array<{ index: number; match: string }> = [];

    let match;
    while ((match = wordRegex.exec(normalizedSentence)) !== null) {
      matches.push({
        index: match.index,
        match: match[0]
      });
    }

    if (matches.length === 0) {
      return null;
    }

    const selectedMatch = matches[Math.floor(Math.random() * matches.length)];
    const blankIndex = selectedMatch.index;
    const matchedWord = selectedMatch.match;

    const blankPlaceholder = '_____';
    const sentenceWithBlank =
      normalizedSentence.slice(0, blankIndex) +
      blankPlaceholder +
      normalizedSentence.slice(blankIndex + matchedWord.length);

    return {
      id: `${id}-${Date.now()}`,
      wordEntryId: id,
      targetWord: matchedWord,
      definition,
      sentenceWithBlank,
      fullSentence: normalizedSentence,
      blankIndex
    };
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async selectFromUserWords(userId: string, count: number) {
    const progresses = await this.prisma.userWordProgress.findMany({
      where: {
        userId,
        wordEntry: {
          exampleSentence: {
            not: ''
          }
        }
      },
      include: { wordEntry: true },
      orderBy: { lastReviewedAt: { sort: 'asc', nulls: 'first' } }
    });

    const validWords = progresses.filter((p) => {
      const sentence = p.wordEntry.exampleSentence.toLowerCase();
      const word = p.wordEntry.word.toLowerCase();
      const wordRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'i');
      return wordRegex.test(sentence);
    });

    const shuffled = this.shuffleArray(validWords).slice(0, count);
    return shuffled.map((p) => ({
      id: p.wordEntry.id,
      word: p.wordEntry.word,
      definition: p.wordEntry.definition,
      exampleSentence: p.wordEntry.exampleSentence,
      phonetic: p.wordEntry.phonetic
    }));
  }

  private async selectFromWordBank(
    userId: string,
    count: number,
    excludeIds: string[] = []
  ) {
    const userWordEntryIds = await this.prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordEntryId: true }
    });
    const excludeSet = new Set([
      ...excludeIds,
      ...userWordEntryIds.map((p) => p.wordEntryId)
    ]);

    const totalAvailable = await this.prisma.wordEntry.count({
      where: {
        exampleSentence: {
          not: ''
        }
      }
    });

    const skip = Math.max(
      0,
      Math.floor(Math.random() * Math.max(1, totalAvailable - count * 2))
    );

    const entries = await this.prisma.wordEntry.findMany({
      skip,
      take: count * 3,
      where: {
        exampleSentence: {
          not: ''
        }
      },
      orderBy: { word: 'asc' }
    });

    const filtered = entries.filter((e) => !excludeSet.has(e.id)).filter((e) => {
      const sentence = e.exampleSentence.toLowerCase();
      const word = e.word.toLowerCase();
      const wordRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'i');
      return wordRegex.test(sentence);
    });

    return this.shuffleArray(filtered)
      .slice(0, count)
      .map((e) => ({
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
