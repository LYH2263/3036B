import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { BatchAddDto } from './batch-add.dto';
import { ParseTextDto } from './parse-text.dto';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours',
  'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he',
  'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'they',
  'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'because', 'if', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'any', 'up',
  'down', 'out', 'off', 'over', 'also', 'still', 'even', 'much',
  'many', 'well', 'back', 'get', 'got', 'make', 'made', 'go', 'went',
  'gone', 'come', 'came', 'take', 'took', 'taken', 'see', 'saw',
  'seen', 'know', 'knew', 'known', 'think', 'thought', 'say', 'said',
  'tell', 'told', 'give', 'gave', 'given', 'use', 'used', 'find',
  'found', 'want', 'let', 'put', 'set', 'run', 'keep', 'kept',
  'begin', 'began', 'seem', 'help', 'show', 'shown', 'hear', 'heard',
  'play', 'move', 'live', 'believe', 'hold', 'bring', 'brought',
  'happen', 'write', 'wrote', 'written', 'provide', 'sit', 'sat',
  'stand', 'stood', 'lose', 'lost', 'pay', 'paid', 'meet', 'met',
  'include', 'continue', 'learn', 'change', 'lead', 'led', 'understand',
  'understood', 'watch', 'follow', 'stop', 'create', 'speak', 'spoke',
  'read', 'allow', 'add', 'spend', 'spent', 'grow', 'grew', 'open',
  'walk', 'win', 'won', 'offer', 'remember', 'love', 'consider',
  'appear', 'buy', 'bought', 'wait', 'serve', 'die', 'died', 'send',
  'sent', 'expect', 'build', 'built', 'stay', 'fall', 'fell', 'cut',
  'reach', 'kill', 'remain', 'suggest', 'raise', 'pass', 'sell',
  'sold', 'require', 'report', 'decide', 'pull', 'develop', 'am',
  'being', 'having', 'doing', 'going', 'looking', 'trying', 'asking',
  'working', 'seeming', 'feeling', 'leaving', 'putting', 'meaning',
  'become', 'became', 'across', 'along', 'already', 'among', 'around',
  'behind', 'beside', 'besides', 'beyond', 'despite', 'except',
  'inside', 'outside', 'since', 'until', 'upon', 'within', 'without',
  'whether', 'though', 'although', 'while', 'whereas', 'however',
  'rather', 'instead', 'therefore', 'thus', 'hence', 'nevertheless',
  'nonetheless', 'meanwhile', 'otherwise', 'anyway', 'somehow',
  'somewhat', 'whatever', 'whenever', 'wherever', 'whoever',
  'whichever', 'nothing', 'everything', 'something', 'anything',
  'nobody', 'everybody', 'somebody', 'anybody', 'none', 'neither',
  'either', 'everywhere', 'somewhere', 'nowhere', 'anywhere', 'always',
  'often', 'usually', 'sometimes', 'never', 'already', 'yet', 'ever',
  'just', 'now', 'soon', 'still', 'already', 'perhaps', 'maybe',
  'probably', 'certainly', 'definitely', 'obviously', 'clearly',
  'actually', 'really', 'quite', 'almost', 'nearly', 'enough',
  'else', 'another', 'several', 'whole', 'able', 'unable', 'going',
  'gone', 'doing', 'done', 'being', 'having', 'getting', 'got',
  'trying', 'talking', 'making', 'taking', 'coming', 'looking',
  'giving', 'using', 'finding', 'telling', 'asking', 'working',
  'seeming', 'feeling', 'leaving', 'calling', 'keeping', 'letting',
  'beginning', 'seeming', 'helping', 'showing', 'hearing', 'playing',
  'moving', 'living', 'believing', 'bringing', 'happening', 'writing',
  'providing', 'sitting', 'standing', 'losing', 'paying', 'meeting',
  'including', 'continuing', 'learning', 'changing', 'leading',
  'understanding', 'watching', 'following', 'stopping', 'creating',
  'speaking', 'reading', 'allowing', 'adding', 'spending', 'growing',
  'opening', 'walking', 'winning', 'offering', 'remembering',
  'loving', 'considering', 'appearing', 'buying', 'waiting',
  'serving', 'dying', 'sending', 'expecting', 'building', 'staying',
  'falling', 'cutting', 'reaching', 'killing', 'remaining',
  'suggesting', 'raising', 'passing', 'selling', 'requiring',
  'reporting', 'deciding', 'pulling', 'developing'
]);

const IRREGULAR_PLURALS: Record<string, string> = {
  men: 'man', women: 'woman', children: 'child', feet: 'foot',
  teeth: 'tooth', geese: 'goose', mice: 'mouse', lice: 'louse',
  oxen: 'ox', criteria: 'criterion', phenomena: 'phenomenon',
  dice: 'die', indices: 'index', matrices: 'matrix',
  analyses: 'analysis', bases: 'base', crises: 'crisis',
  theses: 'thesis', diagnoses: 'diagnosis', hypotheses: 'hypothesis',
  oases: 'oasis', stimuli: 'stimulus', syllabi: 'syllabus',
  alumni: 'alumnus', nuclei: 'nucleus', fungi: 'fungus',
  cacti: 'cactus', data: 'datum', media: 'medium',
  strata: 'stratum', millennia: 'millennium', memoranda: 'memorandum',
  formulae: 'formula', nebulae: 'nebula', larvae: 'larva',
  vertebrae: 'vertebra', antennae: 'antenna'
};

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  async parseText(userId: string, dto: ParseTextDto) {
    const text = dto.text.trim();

    if (!text) {
      return {
        candidates: [],
        totalExtracted: 0,
        stopwordsFiltered: 0,
        masteredFiltered: 0,
        notInDictionary: []
      };
    }

    const tokens = this.tokenize(text);
    const normalized = this.normalizeAndLemmatize(tokens);

    const uniqueWords = [...new Set(normalized)];

    let stopwordsFiltered = 0;
    const nonStopwords = uniqueWords.filter((w) => {
      if (STOPWORDS.has(w)) {
        stopwordsFiltered++;
        return false;
      }
      return true;
    });

    const masteredWordEntryIds = await this.getMasteredWordEntryIds(userId);

    const wordEntries = await this.prisma.wordEntry.findMany({
      where: {
        word: { in: nonStopwords }
      }
    });

    const wordToEntry = new Map<string, typeof wordEntries[number]>();
    for (const entry of wordEntries) {
      wordToEntry.set(entry.word.toLowerCase(), entry);
    }

    const frequencyMap = new Map<string, number>();
    for (const w of normalized) {
      frequencyMap.set(w, (frequencyMap.get(w) ?? 0) + 1);
    }

    let masteredFiltered = 0;
    const candidates: Array<{
      wordEntryId: string;
      word: string;
      phonetic: string;
      definition: string;
      frequency: number;
    }> = [];

    const matchedWords = new Set<string>();
    for (const w of nonStopwords) {
      const entry = wordToEntry.get(w);
      if (!entry) continue;

      matchedWords.add(w);

      if (masteredWordEntryIds.has(entry.id)) {
        masteredFiltered++;
        continue;
      }

      candidates.push({
        wordEntryId: entry.id,
        word: entry.word,
        phonetic: entry.phonetic,
        definition: entry.definition,
        frequency: frequencyMap.get(w) ?? 1
      });
    }

    const notInDictionary = nonStopwords.filter((w) => !matchedWords.has(w));

    candidates.sort((a, b) => b.frequency - a.frequency);

    return {
      candidates,
      totalExtracted: uniqueWords.length,
      stopwordsFiltered,
      masteredFiltered,
      notInDictionary
    };
  }

  async batchAdd(userId: string, dto: BatchAddDto) {
    const existingProgresses = await this.prisma.userWordProgress.findMany({
      where: {
        userId,
        wordEntryId: { in: dto.wordEntryIds }
      },
      select: { wordEntryId: true }
    });

    const existingSet = new Set(existingProgresses.map((p) => p.wordEntryId));

    const validEntries = await this.prisma.wordEntry.findMany({
      where: {
        id: { in: dto.wordEntryIds }
      },
      select: { id: true, word: true }
    });

    const validEntryMap = new Map(validEntries.map((e) => [e.id, e.word]));
    const notFoundIds = dto.wordEntryIds.filter((id) => !validEntryMap.has(id));

    const toAdd = dto.wordEntryIds.filter(
      (id) => validEntryMap.has(id) && !existingSet.has(id)
    );

    if (toAdd.length > 0) {
      await this.prisma.userWordProgress.createMany({
        data: toAdd.map((wordEntryId) => ({
          userId,
          wordEntryId,
          status: 'learning',
          easeFactor: 2.5,
          intervalDays: 1,
          nextReviewAt: new Date()
        })),
        skipDuplicates: true
      });
    }

    const details = dto.wordEntryIds.map((id) => {
      if (!validEntryMap.has(id)) {
        return { wordEntryId: id, word: id, status: 'not_found' as const };
      }
      if (existingSet.has(id)) {
        return { wordEntryId: id, word: validEntryMap.get(id)!, status: 'already_exists' as const };
      }
      return { wordEntryId: id, word: validEntryMap.get(id)!, status: 'added' as const };
    });

    return {
      added: toAdd.length,
      alreadyExists: existingProgresses.length,
      notFound: notFoundIds.length,
      details
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, ' ')
      .replace(/['-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  private normalizeAndLemmatize(tokens: string[]): string[] {
    return tokens.map((token) => this.lemmatize(token));
  }

  private lemmatize(word: string): string {
    if (IRREGULAR_PLURALS[word]) {
      return IRREGULAR_PLURALS[word];
    }

    if (word.endsWith('ies') && word.length > 4) {
      return word.slice(0, -3) + 'y';
    }
    if (word.endsWith('ves') && word.length > 4) {
      return word.slice(0, -3) + 'f';
    }
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') || word.endsWith('ches') || word.endsWith('shes')) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
      return word.slice(0, -1);
    }

    if (word.endsWith('ed') && word.length > 4) {
      const withoutEd = word.slice(0, -2);
      if (withoutEd.length >= 3) return withoutEd;
    }
    if (word.endsWith('ing') && word.length > 5) {
      const withoutIng = word.slice(0, -3);
      if (withoutIng.length >= 3) return withoutIng;
    }
    if (word.endsWith('ly') && word.length > 4) {
      const withoutLy = word.slice(0, -2);
      if (withoutLy.length >= 3) return withoutLy;
    }
    if (word.endsWith('er') && word.length > 4) {
      const withoutEr = word.slice(0, -2);
      if (withoutEr.length >= 3) return withoutEr;
    }
    if (word.endsWith('est') && word.length > 5) {
      const withoutEst = word.slice(0, -3);
      if (withoutEst.length >= 3) return withoutEst;
    }

    return word;
  }

  private async getMasteredWordEntryIds(userId: string): Promise<Set<string>> {
    const progresses = await this.prisma.userWordProgress.findMany({
      where: { userId },
      select: { wordEntryId: true, status: true }
    });

    return new Set(
      progresses
        .filter((p) => p.status === 'known')
        .map((p) => p.wordEntryId)
    );
  }
}
