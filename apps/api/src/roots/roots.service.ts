import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetRootsQueryDto } from './get-roots-query.dto';

@Injectable()
export class RootsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRoots(query: GetRootsQueryDto) {
    const { q, type } = query;
    const normalized = q?.trim().toLowerCase() ?? '';

    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (normalized) {
      where.OR = [
        { root: { contains: normalized, mode: 'insensitive' } },
        { meaning: { contains: normalized, mode: 'insensitive' } },
        { exampleWords: { contains: normalized, mode: 'insensitive' } }
      ];
    }

    const items = await this.prisma.wordRoot.findMany({
      where,
      orderBy: [{ type: 'asc' }, { root: 'asc' }],
      include: {
        _count: {
          select: { relations: true }
        }
      }
    });

    return items.map((item) => ({
      id: item.id,
      root: item.root,
      type: item.type,
      meaning: item.meaning,
      origin: item.origin,
      exampleWords: item.exampleWords,
      derivedWordsCount: item._count.relations
    }));
  }

  async getRootDetail(id: string) {
    const root = await this.prisma.wordRoot.findUnique({
      where: { id },
      include: {
        relations: {
          include: {
            wordEntry: true
          },
          orderBy: {
            wordEntry: {
              word: 'asc'
            }
          }
        }
      }
    });

    if (!root) {
      throw new NotFoundException({
        message: '词根不存在',
        errorCode: 'ROOT_NOT_FOUND'
      });
    }

    return {
      id: root.id,
      root: root.root,
      type: root.type,
      meaning: root.meaning,
      origin: root.origin,
      exampleWords: root.exampleWords,
      derivedWords: root.relations.map((rel) => ({
        id: rel.wordEntry.id,
        word: rel.wordEntry.word,
        definition: rel.wordEntry.definition,
        exampleSentence: rel.wordEntry.exampleSentence,
        phonetic: rel.wordEntry.phonetic,
        position: rel.position
      }))
    };
  }
}
