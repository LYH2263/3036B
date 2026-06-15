import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedWord = readonly [string, string, string, string, string];

const TARGET_WORDS_COUNT = 9300;
const WORD_LIST_FILE = 'google-10000-english-no-swears.txt';
const EXPLAINED_WORD_LIST_FILE = '30k-explained.txt';
const MAX_WORD_LENGTH = 24;
const TEST_ACCOUNT_EMAIL = 'test@lexigram.local';
const TEST_ACCOUNT_PASSWORD = 'Test123456';

const coreWords = [
  ['abandon', '放弃；遗弃', 'He decided to abandon the old plan.', '/əˈbændən/'],
  ['ability', '能力；才能', 'Practice improves your ability to speak English.', '/əˈbɪləti/'],
  ['banana', '香蕉', 'I eat a banana every morning.', '/bəˈnænə/'],
  ['achieve', '实现；达到', 'She worked hard to achieve her goal.', '/əˈtʃiːv/'],
  ['adapt', '适应；改编', 'You need to adapt to a new schedule quickly.', '/əˈdæpt/'],
  ['analysis', '分析', 'The report includes a detailed analysis of data.', '/əˈnæləsɪs/'],
  ['approach', '方法；接近', 'We need a practical approach to learning.', '/əˈprəʊtʃ/'],
  ['attempt', '尝试', 'She made an attempt to answer every question.', '/əˈtempt/'],
  ['benefit', '好处；受益', 'Daily reading will benefit your vocabulary.', '/ˈbenɪfɪt/'],
  ['challenge', '挑战', 'Grammar can be a challenge at first.', '/ˈtʃælɪndʒ/'],
  ['combine', '结合；合并', 'Try to combine new words with examples.', '/kəmˈbaɪn/'],
  ['communicate', '交流；沟通', 'You must communicate clearly in meetings.', '/kəˈmjuːnɪkeɪt/'],
  ['compare', '比较', 'Compare these two sentences carefully.', '/kəmˈpeə(r)/'],
  ['complex', '复杂的', 'The grammar rule is not as complex as it looks.', '/ˈkɒmpleks/'],
  ['conclude', '得出结论', 'Can you conclude this paragraph in one sentence?', '/kənˈkluːd/'],
  ['confirm', '确认', 'Please confirm your email address.', '/kənˈfɜːm/'],
  ['consider', '考虑', 'Consider using shorter sentences.', '/kənˈsɪdə(r)/'],
  ['constant', '持续的；恒定的', 'Learning needs constant effort.', '/ˈkɒnstənt/'],
  ['context', '语境；上下文', 'New words are easier in context.', '/ˈkɒntekst/'],
  ['create', '创造；创建', 'Create a review schedule for this week.', '/kriˈeɪt/'],
  ['critical', '关键的；批判的', 'Critical thinking helps with writing.', '/ˈkrɪtɪkəl/'],
  ['debate', '辩论', 'They had a debate about education.', '/dɪˈbeɪt/'],
  ['define', '定义', 'Please define this term in English.', '/dɪˈfaɪn/'],
  ['demonstrate', '演示；证明', 'The teacher will demonstrate the usage.', '/ˈdemənstreɪt/'],
  ['detail', '细节', 'Pay attention to detail in grammar.', '/ˈdiːteɪl/'],
  ['device', '设备', 'This app works on most mobile devices.', '/dɪˈvaɪs/'],
  ['efficient', '高效的', 'A spaced review plan is efficient.', '/ɪˈfɪʃnt/'],
  ['enhance', '提高；增强', 'Listening can enhance your pronunciation.', '/ɪnˈhɑːns/'],
  ['evaluate', '评估', 'Evaluate your progress every week.', '/ɪˈvæljueɪt/'],
  ['evidence', '证据', 'Use evidence to support your opinion.', '/ˈevɪdəns/'],
  ['expand', '扩展', 'Reading novels can expand your vocabulary.', '/ɪkˈspænd/'],
  ['feature', '特征；功能', 'The app has a sync feature.', '/ˈfiːtʃə(r)/'],
  ['focus', '专注；焦点', 'Focus on one grammar point each day.', '/ˈfəʊkəs/'],
  ['frequent', '频繁的', 'Frequent review improves memory.', '/ˈfriːkwənt/'],
  ['function', '功能；作用', 'This button has a clear function.', '/ˈfʌŋkʃn/'],
  ['generate', '生成；产生', 'The system can generate a review list.', '/ˈdʒenəreɪt/'],
  ['improve', '改进；提高', 'Practice will improve your fluency.', '/ɪmˈpruːv/'],
  ['include', '包含', 'Include one example sentence for each word.', '/ɪnˈkluːd/'],
  ['insight', '洞察', 'The chart gives useful insight.', '/ˈɪnsaɪt/'],
  ['interact', '互动', 'Students interact with exercises online.', '/ˌɪntərˈækt/'],
  ['maintain', '保持；维护', 'Maintain your learning streak.', '/meɪnˈteɪn/'],
  ['method', '方法', 'This method works for beginners.', '/ˈmeθəd/'],
  ['modify', '修改', 'You can modify the sentence to fit context.', '/ˈmɒdɪfaɪ/'],
  ['objective', '目标；客观的', 'Set an objective for this month.', '/əbˈdʒektɪv/'],
  ['organize', '组织', 'Organize vocabulary by topic.', '/ˈɔːɡənaɪz/'],
  ['pattern', '模式', 'Notice the pattern in these sentences.', '/ˈpætən/'],
  ['practice', '练习', 'Practice speaking every morning.', '/ˈpræktɪs/'],
  ['predict', '预测', 'Can you predict the next word?', '/prɪˈdɪkt/'],
  ['progress', '进步', 'Track your progress weekly.', '/ˈprəʊɡres/'],
  ['pronounce', '发音', 'Try to pronounce this word clearly.', '/prəˈnaʊns/'],
  ['review', '复习；回顾', 'Review difficult words before bed.', '/rɪˈvjuː/'],
  ['schedule', '计划表', 'A schedule helps you stay consistent.', '/ˈʃedjuːl/'],
  ['specific', '具体的', 'Give specific examples in your answer.', '/spəˈsɪfɪk/'],
  ['strategy', '策略', 'A good strategy saves time.', '/ˈstrætədʒi/'],
  ['structure', '结构', 'This grammar structure is common.', '/ˈstrʌktʃə(r)/'],
  ['suitable', '合适的', 'Choose a suitable study plan.', '/ˈsuːtəbl/'],
  ['support', '支持', 'Examples support your argument.', '/səˈpɔːt/'],
  ['target', '目标', 'Set a target of 10 words a day.', '/ˈtɑːɡɪt/'],
  ['technique', '技巧', 'Use a memory technique for long words.', '/tekˈniːk/'],
  ['understand', '理解', 'I understand this rule now.', '/ˌʌndəˈstænd/'],
  ['update', '更新', 'Update your notes after class.', '/ˌʌpˈdeɪt/'],
  ['visualize', '可视化', 'Visualize your progress on charts.', '/ˈvɪʒuəlaɪz/']
] as const satisfies readonly SeedWord[];

function resolveDataFilePath(fileName: string): string {
  const cwdPath = path.join(process.cwd(), 'prisma', 'data', fileName);
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  const currentFilePath = path.join(__dirname, 'data', fileName);
  if (existsSync(currentFilePath)) {
    return currentFilePath;
  }

  throw new Error(`词典文件不存在：${fileName}`);
}

function resolveWordListPath(): string {
  return resolveDataFilePath(WORD_LIST_FILE);
}

function resolveExplainedWordListPath(): string {
  return resolveDataFilePath(EXPLAINED_WORD_LIST_FILE);
}

function loadExtendedWordCandidates(): string[] {
  const raw = readFileSync(resolveWordListPath(), 'utf8');
  return raw
    .split(/\r?\n/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z]+(?:['-][a-z]+)?$/.test(item))
    .filter((item) => item.length >= 2 && item.length <= MAX_WORD_LENGTH);
}

function toPrimaryPhonetic(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const first = trimmed
    .split(/\s{2,}|\t+/)
    .map((item) => item.trim())
    .filter(Boolean)[0];

  if (!first) {
    return '';
  }

  const normalized = first.replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}/` : '';
}

type DictionaryEntry = Readonly<{
  definition: string;
  phonetic: string;
}>;

function loadWordDictionary(): Map<string, DictionaryEntry> {
  const raw = readFileSync(resolveExplainedWordListPath(), 'utf8');
  const lines = raw.split(/\r?\n/);
  const dictionary = new Map<string, DictionaryEntry>();

  for (let i = 0; i + 2 < lines.length; i += 1) {
    const header = lines[i]?.trim() ?? '';
    const match = header.match(/^([a-z]+(?:['-][a-z]+)?)\s+\d+$/i);
    if (!match) {
      continue;
    }

    const word = match[1].toLowerCase();
    const phonetic = toPrimaryPhonetic(lines[i + 1] ?? '');
    const definition = (lines[i + 2] ?? '').trim();

    if (!definition) {
      continue;
    }

    dictionary.set(word, {
      definition,
      phonetic
    });
  }

  return dictionary;
}

function hasChineseText(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function buildExtendedWords(
  baseWords: readonly SeedWord[],
  dictionary: Map<string, DictionaryEntry>
): SeedWord[] {
  const needed = Math.max(0, TARGET_WORDS_COUNT - baseWords.length);
  if (needed === 0) {
    return [];
  }

  const existing = new Set(baseWords.map(([word]) => word.toLowerCase()));
  const candidates = loadExtendedWordCandidates();
  const generated: SeedWord[] = [];

  for (const word of candidates) {
    if (generated.length >= needed) {
      break;
    }
    if (existing.has(word)) {
      continue;
    }

    const dictionaryEntry = dictionary.get(word);
    if (!dictionaryEntry || !hasChineseText(dictionaryEntry.definition)) {
      continue;
    }

    existing.add(word);
    generated.push([
      word,
      dictionaryEntry.definition,
      `I am learning the word "${word}" in lexigram.`,
      dictionaryEntry.phonetic,
      generateEtymology(word)
    ] as const);
  }

  if (generated.length < needed) {
    throw new Error(
      `扩展词库不足或词义缺失：目标 ${TARGET_WORDS_COUNT}，现有 ${baseWords.length + generated.length}`
    );
  }

  return generated;
}

function generateEtymology(word: string): string {
  const firstLetter = word.charAt(0).toUpperCase();
  const length = word.length;

  const suffixInfo = getSuffixInfo(word);
  const prefixInfo = getPrefixInfo(word);

  const tidbits: string[] = [];

  if (prefixInfo) {
    tidbits.push(`前缀 "${prefixInfo.prefix}" 表示${prefixInfo.meaning}`);
  }
  if (suffixInfo) {
    tidbits.push(`后缀 "${suffixInfo.suffix}" 常用于${suffixInfo.meaning}`);
  }

  if (tidbits.length === 0) {
    tidbits.push(`这是一个以 ${firstLetter} 开头的 ${length} 字母单词`);
  }

  return tidbits.join('；') + '。';
}

function getPrefixInfo(word: string): { prefix: string; meaning: string } | null {
  const prefixes = [
    { prefix: 'un', meaning: '"不、相反"' },
    { prefix: 're', meaning: '"再、重新"' },
    { prefix: 'pre', meaning: '"在…之前"' },
    { prefix: 'dis', meaning: '"不、相反"' },
    { prefix: 'mis', meaning: '"错误、坏"' },
    { prefix: 'in', meaning: '"不、在内"' },
    { prefix: 'im', meaning: '"不、在内"' },
    { prefix: 'ex', meaning: '"出、外"' },
    { prefix: 'en', meaning: '"使成为"' },
    { prefix: 'sub', meaning: '"在…下面"' },
    { prefix: 'super', meaning: '"超级、在…之上"' },
    { prefix: 'inter', meaning: '"在…之间"' },
    { prefix: 'trans', meaning: '"跨越、转变"' },
    { prefix: 'com', meaning: '"共同、一起"' },
    { prefix: 'con', meaning: '"共同、一起"' },
    { prefix: 'de', meaning: '"向下、去除"' },
    { prefix: 'pro', meaning: '"向前、支持"' },
    { prefix: 'anti', meaning: '"反对、对抗"' },
    { prefix: 'auto', meaning: '"自己、自动"' },
    { prefix: 'bi', meaning: '"二、双"' },
    { prefix: 'tri', meaning: '"三"' },
    { prefix: 'multi', meaning: '"多"' },
    { prefix: 'over', meaning: '"过度、在…之上"' },
    { prefix: 'under', meaning: '"在…下面、不足"' },
    { prefix: 'out', meaning: '"外、超过"' },
    { prefix: 'over', meaning: '"过度、超过"' }
  ];

  for (const item of prefixes) {
    if (word.startsWith(item.prefix) && word.length > item.prefix.length + 2) {
      return item;
    }
  }

  return null;
}

function getSuffixInfo(word: string): { suffix: string; meaning: string } | null {
  const suffixes = [
    { suffix: 'tion', meaning: '名词，表示"行为、状态"' },
    { suffix: 'sion', meaning: '名词，表示"行为、状态"' },
    { suffix: 'ness', meaning: '名词，表示"性质、状态"' },
    { suffix: 'ment', meaning: '名词，表示"行为、结果"' },
    { suffix: 'able', meaning: '形容词，表示"能够…的"' },
    { suffix: 'ible', meaning: '形容词，表示"能够…的"' },
    { suffix: 'ful', meaning: '形容词，表示"充满…的"' },
    { suffix: 'less', meaning: '形容词，表示"没有…的"' },
    { suffix: 'ous', meaning: '形容词，表示"具有…性质的"' },
    { suffix: 'ive', meaning: '形容词，表示"有…倾向的"' },
    { suffix: 'al', meaning: '形容词，表示"与…有关的"' },
    { suffix: 'ly', meaning: '副词，表示"以…方式"' },
    { suffix: 'er', meaning: '名词，表示"做…的人/物"' },
    { suffix: 'or', meaning: '名词，表示"做…的人/物"' },
    { suffix: 'ist', meaning: '名词，表示"从事…的人"' },
    { suffix: 'ism', meaning: '名词，表示"主义、学说"' },
    { suffix: 'ity', meaning: '名词，表示"性质、状态"' },
    { suffix: 'ty', meaning: '名词，表示"性质、状态"' },
    { suffix: 'ize', meaning: '动词，表示"使成为"' },
    { suffix: 'ify', meaning: '动词，表示"使成为"' },
    { suffix: 'en', meaning: '动词，表示"使变成"' },
    { suffix: 'ate', meaning: '动词，表示"使…"' },
    { suffix: 'ing', meaning: '动名词/现在分词' },
    { suffix: 'ed', meaning: '过去式/过去分词' },
    { suffix: 'ly', meaning: '副词后缀' },
    { suffix: 'ward', meaning: '副词，表示"朝向"' },
    { suffix: 'dom', meaning: '名词，表示"领域、状态"' },
    { suffix: 'ship', meaning: '名词，表示"状态、关系"' },
    { suffix: 'hood', meaning: '名词，表示"状态、身份"' }
  ];

  for (const item of suffixes) {
    if (word.endsWith(item.suffix) && word.length > item.suffix.length + 2) {
      return item;
    }
  }

  return null;
}

function assertChineseDefinitionCoverage(allWords: readonly SeedWord[]) {
  const missing = allWords
    .filter(([, definition]) => !hasChineseText(definition))
    .map(([word]) => word);

  if (missing.length > 0) {
    throw new Error(`存在缺少中文词义的单词：${missing.slice(0, 10).join(', ')}`);
  }
}

const wordDictionary = loadWordDictionary();
const coreWordsWithEtymology = coreWords.map(([word, definition, exampleSentence, phonetic]) => [
  word,
  definition,
  exampleSentence,
  phonetic,
  generateEtymology(word)
] as const) as SeedWord[];
const words = [...coreWordsWithEtymology, ...buildExtendedWords(coreWordsWithEtymology, wordDictionary)];
assertChineseDefinitionCoverage(words);

const lessons = [
  {
    title: '一般现在时',
    level: 'basic',
    content:
      '一般现在时用于描述习惯、事实与经常性动作。主语为第三人称单数时，谓语动词通常加 -s/-es。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'She ____ to school by bus every day.',
        options: ['go', 'goes', 'went', 'going'],
        answer: 'goes',
        explanation: '第三人称单数 she 对应 goes。'
      },
      {
        type: 'fill_blank',
        prompt: 'The earth ____ around the sun.',
        options: [],
        answer: 'moves',
        explanation: '客观事实使用一般现在时。'
      },
      {
        type: 'single_choice',
        prompt: 'Which sentence is correct?',
        options: ['He play football.', 'He plays football.', 'He playing football.'],
        answer: 'He plays football.',
        explanation: '第三人称单数动词加 s。'
      }
    ]
  },
  {
    title: '一般过去时',
    level: 'basic',
    content: '一般过去时表示过去发生的动作或状态，常与 yesterday、last week 等时间状语连用。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'We ____ a movie last night.',
        options: ['watch', 'watched', 'watches'],
        answer: 'watched',
        explanation: 'last night 提示过去时。'
      },
      {
        type: 'fill_blank',
        prompt: 'She ____ (be) very tired yesterday.',
        options: [],
        answer: 'was',
        explanation: '主语 she 在过去时用 was。'
      },
      {
        type: 'single_choice',
        prompt: 'Which one is NOT past tense?',
        options: ['studied', 'ran', 'studies'],
        answer: 'studies',
        explanation: 'studies 为一般现在时。'
      }
    ]
  },
  {
    title: '一般将来时',
    level: 'basic',
    content: '一般将来时表达将要发生的动作，常见结构为 will + 动词原形。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'I ____ call you tonight.',
        options: ['will', 'am', 'did'],
        answer: 'will',
        explanation: '一般将来时常用 will。'
      },
      {
        type: 'fill_blank',
        prompt: 'They ____ (visit) Beijing next month.',
        options: [],
        answer: 'will visit',
        explanation: 'next month 提示将来。'
      },
      {
        type: 'single_choice',
        prompt: 'Future tense sentence:',
        options: ['He is tired.', 'He will arrive soon.', 'He arrived.'],
        answer: 'He will arrive soon.',
        explanation: 'will + 动词原形。'
      }
    ]
  },
  {
    title: '现在进行时',
    level: 'basic',
    content: '现在进行时表示正在发生的动作，结构为 am/is/are + doing。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'Listen! The birds ____.',
        options: ['sing', 'are singing', 'sang'],
        answer: 'are singing',
        explanation: 'Listen! 常搭配进行时。'
      },
      {
        type: 'fill_blank',
        prompt: 'I ____ (read) a book now.',
        options: [],
        answer: 'am reading',
        explanation: 'now 提示正在进行。'
      },
      {
        type: 'single_choice',
        prompt: 'Which is present continuous?',
        options: ['She cooks dinner.', 'She is cooking dinner.', 'She cooked dinner.'],
        answer: 'She is cooking dinner.',
        explanation: 'be + doing。'
      }
    ]
  },
  {
    title: '名词单复数',
    level: 'basic',
    content: '可数名词有单复数变化，常见复数形式加 -s 或 -es，不规则变化需单独记忆。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'One child, two ____.',
        options: ['childs', 'children', 'childes'],
        answer: 'children',
        explanation: 'child 的不规则复数是 children。'
      },
      {
        type: 'fill_blank',
        prompt: 'There are many ____ (box) in the room.',
        options: [],
        answer: 'boxes',
        explanation: 'box 复数加 -es。'
      },
      {
        type: 'single_choice',
        prompt: 'Correct plural form of “city” is:',
        options: ['citys', 'cities', 'cityes'],
        answer: 'cities',
        explanation: '辅音+y 变 ies。'
      }
    ]
  },
  {
    title: '情态动词 can/must',
    level: 'intermediate',
    content: '情态动词后接动词原形，can 表能力/许可，must 表必须或推测。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'You ____ wear a helmet when riding a bike.',
        options: ['can', 'must', 'may'],
        answer: 'must',
        explanation: '表示必须。'
      },
      {
        type: 'fill_blank',
        prompt: 'She can ____ (swim) very fast.',
        options: [],
        answer: 'swim',
        explanation: '情态动词后用原形。'
      },
      {
        type: 'single_choice',
        prompt: '“Can I open the window?” asks for ____.',
        options: ['ability', 'permission', 'obligation'],
        answer: 'permission',
        explanation: 'can 可表示请求许可。'
      }
    ]
  },
  {
    title: '比较级与最高级',
    level: 'intermediate',
    content: '形容词比较级用于两者比较，最高级用于三者及以上比较。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'This book is ____ than that one.',
        options: ['interesting', 'more interesting', 'most interesting'],
        answer: 'more interesting',
        explanation: '两者比较用比较级。'
      },
      {
        type: 'fill_blank',
        prompt: 'He is the ____ (tall) student in class.',
        options: [],
        answer: 'tallest',
        explanation: '三者以上用最高级。'
      },
      {
        type: 'single_choice',
        prompt: 'Which sentence is correct?',
        options: ['She is best than me.', 'She is better than me.', 'She is more better than me.'],
        answer: 'She is better than me.',
        explanation: 'good 的比较级是 better。'
      }
    ]
  },
  {
    title: '被动语态',
    level: 'intermediate',
    content: '被动语态强调动作承受者，结构常为 be + 过去分词。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'English ____ in many countries.',
        options: ['speaks', 'is spoken', 'spoke'],
        answer: 'is spoken',
        explanation: '被动语态 be + done。'
      },
      {
        type: 'fill_blank',
        prompt: 'The room ____ (clean) every day.',
        options: [],
        answer: 'is cleaned',
        explanation: '主语是动作承受者。'
      },
      {
        type: 'single_choice',
        prompt: 'Passive voice example:',
        options: ['Tom writes a letter.', 'A letter is written by Tom.', 'Tom is write a letter.'],
        answer: 'A letter is written by Tom.',
        explanation: '被动语态完整结构。'
      }
    ]
  },
  {
    title: '现在完成时',
    level: 'intermediate',
    content: '现在完成时表示过去发生并对现在有影响的动作，结构为 have/has + 过去分词。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'I ____ finished my homework.',
        options: ['have', 'has', 'had'],
        answer: 'have',
        explanation: 'I 搭配 have。'
      },
      {
        type: 'fill_blank',
        prompt: 'She ____ (visit) London twice.',
        options: [],
        answer: 'has visited',
        explanation: '第三人称单数用 has。'
      },
      {
        type: 'single_choice',
        prompt: 'Signal word for present perfect:',
        options: ['yesterday', 'already', 'last year'],
        answer: 'already',
        explanation: 'already 常与现在完成时搭配。'
      }
    ]
  },
  {
    title: '条件句（第一类）',
    level: 'intermediate',
    content: '第一类条件句表示可能发生的真实条件，结构 if + 一般现在时，主句 will + 动词原形。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'If it rains, we ____ at home.',
        options: ['stay', 'will stay', 'stayed'],
        answer: 'will stay',
        explanation: '主句用 will。'
      },
      {
        type: 'fill_blank',
        prompt: 'If you ____ (study) hard, you will pass.',
        options: [],
        answer: 'study',
        explanation: 'if 从句用一般现在时。'
      },
      {
        type: 'single_choice',
        prompt: 'Correct first conditional:',
        options: ['If he will come, I will call.', 'If he comes, I will call.', 'If he came, I will call.'],
        answer: 'If he comes, I will call.',
        explanation: 'if 从句不用 will。'
      }
    ]
  },
  {
    title: '定语从句（关系代词）',
    level: 'advanced',
    content: '定语从句用于修饰先行词，常见关系代词有 who、which、that。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'The man ____ lives next door is a doctor.',
        options: ['which', 'who', 'where'],
        answer: 'who',
        explanation: '先行词是人。'
      },
      {
        type: 'fill_blank',
        prompt: 'This is the book ____ I bought yesterday.',
        options: [],
        answer: 'that',
        explanation: 'that 可指物。'
      },
      {
        type: 'single_choice',
        prompt: 'Choose the correct one:',
        options: ['The car who is red is mine.', 'The car which is red is mine.', 'The car where is red is mine.'],
        answer: 'The car which is red is mine.',
        explanation: '先行词是 car，使用 which。'
      }
    ]
  },
  {
    title: '虚拟语气（与现在事实相反）',
    level: 'advanced',
    content: '与现在事实相反的虚拟语气常用 if + 过去式，主句 would + 动词原形。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'If I ____ rich, I would travel the world.',
        options: ['am', 'was', 'were'],
        answer: 'were',
        explanation: '虚拟语气常用 were。'
      },
      {
        type: 'fill_blank',
        prompt: 'If she ____ (know) the answer, she would tell us.',
        options: [],
        answer: 'knew',
        explanation: 'if 从句用过去式。'
      },
      {
        type: 'single_choice',
        prompt: 'Correct subjunctive sentence:',
        options: ['If he is here, he would help.', 'If he were here, he would help.', 'If he was here, he will help.'],
        answer: 'If he were here, he would help.',
        explanation: '经典虚拟语气搭配。'
      }
    ]
  },
  {
    title: '非谓语动词（to do / doing / done）',
    level: 'advanced',
    content: '非谓语形式在句中可作主语、宾语、定语、状语等，常见有不定式、动名词、过去分词。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'I enjoy ____ English podcasts.',
        options: ['listen', 'listening', 'to listen'],
        answer: 'listening',
        explanation: 'enjoy 后接 doing。'
      },
      {
        type: 'fill_blank',
        prompt: 'It is important ____ (review) regularly.',
        options: [],
        answer: 'to review',
        explanation: 'It is + adj + to do。'
      },
      {
        type: 'single_choice',
        prompt: 'The book ____ by my friend is useful.',
        options: ['write', 'written', 'writing'],
        answer: 'written',
        explanation: '过去分词作后置定语。'
      }
    ]
  },
  {
    title: '强调句型 It is ... that ...',
    level: 'advanced',
    content: '强调句型用于突出句子中的某个成分，结构为 It is/was + 被强调部分 + that/who + 其他。',
    questions: [
      {
        type: 'single_choice',
        prompt: '____ I met yesterday was Tom.',
        options: ['It is', 'It was', 'There was'],
        answer: 'It was',
        explanation: '过去时间 yesterday 对应 was。'
      },
      {
        type: 'fill_blank',
        prompt: 'It is in this room ____ we study.',
        options: [],
        answer: 'that',
        explanation: '强调句结构固定。'
      },
      {
        type: 'single_choice',
        prompt: 'Correct emphatic structure:',
        options: ['It was she that solved it.', 'She was that solved it.', 'It she was that solved it.'],
        answer: 'It was she that solved it.',
        explanation: 'It is/was + 强调部分 + that。'
      }
    ]
  },
  {
    title: '倒装句基础',
    level: 'advanced',
    content: '倒装句通过调整语序实现强调或语法要求，如 never, hardly 放句首触发部分倒装。',
    questions: [
      {
        type: 'single_choice',
        prompt: 'Never ____ such a beautiful place.',
        options: ['I have seen', 'have I seen', 'I saw'],
        answer: 'have I seen',
        explanation: '否定副词置前，助动词提前。'
      },
      {
        type: 'fill_blank',
        prompt: 'Only then ____ (did/realize) the truth.',
        options: [],
        answer: 'did I realize',
        explanation: 'only+状语置前，主句部分倒装。'
      },
      {
        type: 'single_choice',
        prompt: 'Which is inversion?',
        options: ['I seldom go out.', 'Seldom do I go out.', 'I do seldom go out.'],
        answer: 'Seldom do I go out.',
        explanation: '部分倒装格式正确。'
      }
    ]
  }
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(TEST_ACCOUNT_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: TEST_ACCOUNT_EMAIL },
    create: {
      email: TEST_ACCOUNT_EMAIL,
      passwordHash
    },
    update: {
      passwordHash
    }
  });

  const savedWordEntries: Map<string, string> = new Map();
  for (const [word, definition, exampleSentence, phonetic, etymology] of words) {
    const saved = await prisma.wordEntry.upsert({
      where: { word },
      create: { word, definition, exampleSentence, phonetic, etymology },
      update: { definition, exampleSentence, phonetic, etymology }
    });
    savedWordEntries.set(word.toLowerCase(), saved.id);
  }

  const rootsData = [
    {
      root: 'ject',
      type: 'root' as const,
      meaning: '投，掷，抛',
      origin: '拉丁语 jacere',
      exampleWords: 'project, reject, inject',
      words: ['project', 'reject', 'inject', 'subject', 'object']
    },
    {
      root: 'dict',
      type: 'root' as const,
      meaning: '说，言',
      origin: '拉丁语 dicere',
      exampleWords: 'predict, dictionary, dictate',
      words: ['predict', 'dictionary', 'dictate', 'verdict', 'contradict']
    },
    {
      root: 'struct',
      type: 'root' as const,
      meaning: '建造，建立',
      origin: '拉丁语 struere',
      exampleWords: 'structure, construct, instruct',
      words: ['structure', 'construct', 'instruct', 'destruct', 'obstruct']
    },
    {
      root: 'port',
      type: 'root' as const,
      meaning: '携带，运送',
      origin: '拉丁语 portare',
      exampleWords: 'transport, import, export',
      words: ['transport', 'import', 'export', 'support', 'report']
    },
    {
      root: 'vis/vid',
      type: 'root' as const,
      meaning: '看，观察',
      origin: '拉丁语 videre',
      exampleWords: 'vision, visible, video',
      words: ['vision', 'visible', 'video', 'visualize', 'provide', 'evidence']
    },
    {
      root: 'form',
      type: 'root' as const,
      meaning: '形状，形式',
      origin: '拉丁语 forma',
      exampleWords: 'inform, reform, transform',
      words: ['inform', 'reform', 'transform', 'conform', 'perform', 'format']
    },
    {
      root: 'duct',
      type: 'root' as const,
      meaning: '引导，带领',
      origin: '拉丁语 ducere',
      exampleWords: 'conduct, produce, reduce',
      words: ['conduct', 'produce', 'reduce', 'introduce', 'educate', 'deduce']
    },
    {
      root: 'scrib/script',
      type: 'root' as const,
      meaning: '写',
      origin: '拉丁语 scribere',
      exampleWords: 'describe, subscribe, script',
      words: ['describe', 'subscribe', 'script', 'prescribe', 'manuscript']
    },
    {
      root: 'spec/spect',
      type: 'root' as const,
      meaning: '看',
      origin: '拉丁语 specere',
      exampleWords: 'inspect, respect, expect',
      words: ['inspect', 'respect', 'expect', 'aspect', 'suspect', 'spectacle']
    },
    {
      root: 'fer',
      type: 'root' as const,
      meaning: '携带，带来',
      origin: '拉丁语 ferre',
      exampleWords: 'transfer, refer, prefer',
      words: ['transfer', 'refer', 'prefer', 'offer', 'differ', 'suffer']
    },
    {
      root: 'mit/miss',
      type: 'root' as const,
      meaning: '发送，派遣',
      origin: '拉丁语 mittere',
      exampleWords: 'transmit, submit, mission',
      words: ['transmit', 'submit', 'mission', 'permit', 'admit', 'commit']
    },
    {
      root: 'tract',
      type: 'root' as const,
      meaning: '拉，拖',
      origin: '拉丁语 trahere',
      exampleWords: 'attract, extract, contract',
      words: ['attract', 'extract', 'contract', 'abstract', 'distract', 'subtract']
    },
    {
      root: 'graph/gram',
      type: 'root' as const,
      meaning: '写，画，记录',
      origin: '希腊语 graphein',
      exampleWords: 'photograph, diagram, program',
      words: ['photograph', 'diagram', 'program', 'grammar', 'telegram']
    },
    {
      root: 'log/logy',
      type: 'root' as const,
      meaning: '言语，学科',
      origin: '希腊语 logos',
      exampleWords: 'biology, psychology, dialog',
      words: ['biology', 'psychology', 'dialog', 'logic', 'apology', 'technology']
    },
    {
      root: 'phon',
      type: 'root' as const,
      meaning: '声音',
      origin: '希腊语 phone',
      exampleWords: 'telephone, microphone, symphony',
      words: ['telephone', 'microphone', 'symphony', 'phonetic', 'pronounce']
    },
    {
      root: 'mem',
      type: 'root' as const,
      meaning: '记忆',
      origin: '拉丁语 memor',
      exampleWords: 'memory, remember, memorial',
      words: ['memory', 'remember', 'memorial', 'memorize', 'commemorate']
    },
    {
      root: 'cap/cep/ceiv',
      type: 'root' as const,
      meaning: '拿，取',
      origin: '拉丁语 capere',
      exampleWords: 'capture, receive, accept',
      words: ['capture', 'receive', 'accept', 'concept', 'except', 'perceive']
    },
    {
      root: 'pend/pens',
      type: 'root' as const,
      meaning: '悬挂，支付',
      origin: '拉丁语 pendere',
      exampleWords: 'depend, expense, suspend',
      words: ['depend', 'expense', 'suspend', 'pension', 'independent']
    },
    {
      root: 'vert/vers',
      type: 'root' as const,
      meaning: '转',
      origin: '拉丁语 vertere',
      exampleWords: 'convert, reverse, universe',
      words: ['convert', 'reverse', 'universe', 'diverse', 'version', 'advertise']
    },
    {
      root: 'act',
      type: 'root' as const,
      meaning: '做，行动',
      origin: '拉丁语 agere',
      exampleWords: 'action, active, react',
      words: ['action', 'active', 'react', 'interact', 'exact', 'transaction']
    },
    {
      root: 'fin',
      type: 'root' as const,
      meaning: '结束，边界',
      origin: '拉丁语 finis',
      exampleWords: 'final, finish, define',
      words: ['final', 'finish', 'define', 'infinite', 'refine', 'confine']
    },
    {
      root: 'mov/mot/mob',
      type: 'root' as const,
      meaning: '移动',
      origin: '拉丁语 movere',
      exampleWords: 'move, motion, mobile',
      words: ['move', 'motion', 'mobile', 'remote', 'promote', 'emotion']
    },
    {
      root: 'un-',
      type: 'prefix' as const,
      meaning: '不，相反',
      origin: '古英语',
      exampleWords: 'unhappy, unknown, unable',
      words: ['unhappy', 'unknown', 'unable', 'unfair', 'unlock', 'unusual']
    },
    {
      root: 're-',
      type: 'prefix' as const,
      meaning: '再，重新，回',
      origin: '拉丁语',
      exampleWords: 'return, review, rebuild',
      words: ['return', 'review', 'rebuild', 'repeat', 'replace', 'report']
    },
    {
      root: 'pre-',
      type: 'prefix' as const,
      meaning: '前，预先',
      origin: '拉丁语 prae',
      exampleWords: 'predict, prevent, prepare',
      words: ['predict', 'prevent', 'prepare', 'preview', 'prefix', 'prescribe']
    },
    {
      root: 'dis-',
      type: 'prefix' as const,
      meaning: '不，分开，相反',
      origin: '拉丁语',
      exampleWords: 'disagree, disappear, discover',
      words: ['disagree', 'disappear', 'discover', 'discount', 'dislike', 'disorder']
    },
    {
      root: 'in-/im-/il-/ir-',
      type: 'prefix' as const,
      meaning: '不，向内',
      origin: '拉丁语',
      exampleWords: 'impossible, illegal, irregular',
      words: ['impossible', 'illegal', 'irregular', 'inactive', 'invisible', 'import']
    },
    {
      root: 'ex-/e-',
      type: 'prefix' as const,
      meaning: '出，外，前任',
      origin: '拉丁语',
      exampleWords: 'export, exit, exclude',
      words: ['export', 'exit', 'exclude', 'expand', 'extract', 'evade']
    },
    {
      root: 'con-/com-/co-',
      type: 'prefix' as const,
      meaning: '共同，一起',
      origin: '拉丁语 cum',
      exampleWords: 'combine, connect, cooperate',
      words: ['combine', 'connect', 'cooperate', 'communicate', 'complete', 'context']
    },
    {
      root: 'trans-',
      type: 'prefix' as const,
      meaning: '跨越，转变',
      origin: '拉丁语',
      exampleWords: 'transport, transfer, transform',
      words: ['transport', 'transfer', 'transform', 'translate', 'transmit', 'transparent']
    },
    {
      root: 'sub-',
      type: 'prefix' as const,
      meaning: '在下面，次级',
      origin: '拉丁语',
      exampleWords: 'subway, submarine, subject',
      words: ['subway', 'submarine', 'subject', 'submit', 'subscribe', 'subtract']
    },
    {
      root: 'super-',
      type: 'prefix' as const,
      meaning: '超级，在上面',
      origin: '拉丁语',
      exampleWords: 'superman, supermarket, superior',
      words: ['superman', 'supermarket', 'superior', 'supervise', 'supernatural']
    },
    {
      root: 'inter-',
      type: 'prefix' as const,
      meaning: '在...之间，相互',
      origin: '拉丁语',
      exampleWords: 'international, internet, interact',
      words: ['international', 'internet', 'interact', 'interview', 'interrupt']
    },
    {
      root: 'auto-',
      type: 'prefix' as const,
      meaning: '自己，自动',
      origin: '希腊语 autos',
      exampleWords: 'automatic, automobile, autobiography',
      words: ['automatic', 'automobile', 'autobiography', 'autonomy', 'autograph']
    },
    {
      root: '-tion/-sion',
      type: 'suffix' as const,
      meaning: '名词后缀，表示行为/状态',
      origin: '拉丁语',
      exampleWords: 'action, education, decision',
      words: ['action', 'education', 'decision', 'attention', 'information', 'vision']
    },
    {
      root: '-ment',
      type: 'suffix' as const,
      meaning: '名词后缀，表示行为/结果',
      origin: '拉丁语 -mentum',
      exampleWords: 'movement, development, government',
      words: ['movement', 'development', 'government', 'treatment', 'statement']
    },
    {
      root: '-able/-ible',
      type: 'suffix' as const,
      meaning: '形容词后缀，表示可...的',
      origin: '拉丁语 -abilis',
      exampleWords: 'readable, possible, visible',
      words: ['readable', 'possible', 'visible', 'comfortable', 'suitable', 'flexible']
    },
    {
      root: '-ful',
      type: 'suffix' as const,
      meaning: '形容词后缀，表示充满...的',
      origin: '古英语 -full',
      exampleWords: 'beautiful, helpful, careful',
      words: ['beautiful', 'helpful', 'careful', 'powerful', 'wonderful', 'grateful']
    },
    {
      root: '-less',
      type: 'suffix' as const,
      meaning: '形容词后缀，表示没有...的',
      origin: '古英语 -leas',
      exampleWords: 'hopeless, careless, useless',
      words: ['hopeless', 'careless', 'useless', 'endless', 'homeless', 'regardless']
    },
    {
      root: '-ly',
      type: 'suffix' as const,
      meaning: '副词后缀，表示...地',
      origin: '古英语 -lice',
      exampleWords: 'quickly, carefully, happily',
      words: ['quickly', 'carefully', 'happily', 'slowly', 'finally', 'usually']
    },
    {
      root: '-er/-or',
      type: 'suffix' as const,
      meaning: '名词后缀，表示做...的人/物',
      origin: '古英语/拉丁语',
      exampleWords: 'teacher, actor, computer',
      words: ['teacher', 'actor', 'computer', 'writer', 'visitor', 'inventor']
    },
    {
      root: '-ist',
      type: 'suffix' as const,
      meaning: '名词后缀，表示...主义者/专家',
      origin: '希腊语 -istes',
      exampleWords: 'scientist, artist, specialist',
      words: ['scientist', 'artist', 'specialist', 'tourist', 'novelist', 'economist']
    },
    {
      root: '-ize/-ise',
      type: 'suffix' as const,
      meaning: '动词后缀，表示使...化',
      origin: '希腊语 -izein',
      exampleWords: 'realize, organize, modernize',
      words: ['realize', 'organize', 'modernize', 'visualize', 'emphasize', 'criticize']
    },
    {
      root: '-ness',
      type: 'suffix' as const,
      meaning: '名词后缀，表示...性质/状态',
      origin: '古英语 -nes',
      exampleWords: 'happiness, kindness, darkness',
      words: ['happiness', 'kindness', 'darkness', 'weakness', 'awareness', 'illness']
    },
    {
      root: '-ity/-ty',
      type: 'suffix' as const,
      meaning: '名词后缀，表示...性质/状态',
      origin: '拉丁语 -itas',
      exampleWords: 'ability, reality, quality',
      words: ['ability', 'reality', 'quality', 'activity', 'possibility', 'university']
    },
    {
      root: '-al',
      type: 'suffix' as const,
      meaning: '形容词后缀，表示...的',
      origin: '拉丁语 -alis',
      exampleWords: 'national, natural, personal',
      words: ['national', 'natural', 'personal', 'traditional', 'cultural', 'musical']
    },
    {
      root: '-ous/-ious',
      type: 'suffix' as const,
      meaning: '形容词后缀，表示充满...的',
      origin: '拉丁语 -osus',
      exampleWords: 'famous, dangerous, curious',
      words: ['famous', 'dangerous', 'curious', 'nervous', 'various', 'delicious']
    }
  ];

  for (const rootData of rootsData) {
    const savedRoot = await prisma.wordRoot.upsert({
      where: {
        root_type: {
          root: rootData.root,
          type: rootData.type
        }
      },
      create: {
        root: rootData.root,
        type: rootData.type,
        meaning: rootData.meaning,
        origin: rootData.origin,
        exampleWords: rootData.exampleWords
      },
      update: {
        meaning: rootData.meaning,
        origin: rootData.origin,
        exampleWords: rootData.exampleWords
      }
    });

    for (const word of rootData.words) {
      const wordId = savedWordEntries.get(word.toLowerCase());
      if (wordId) {
        const position = word.toLowerCase().includes(rootData.root.replace(/[-/]/g, ''))
          ? rootData.type === 'prefix'
            ? 'prefix'
            : rootData.type === 'suffix'
            ? 'suffix'
            : 'root'
          : 'root';

        await prisma.wordRootRelation.upsert({
          where: {
            rootId_wordEntryId: {
              rootId: savedRoot.id,
              wordEntryId: wordId
            }
          },
          create: {
            rootId: savedRoot.id,
            wordEntryId: wordId,
            position
          },
          update: {
            position
          }
        });
      }
    }
  }

  for (const lesson of lessons) {
    const savedLesson = await prisma.grammarLesson.upsert({
      where: { title: lesson.title },
      create: {
        title: lesson.title,
        level: lesson.level,
        content: lesson.content
      },
      update: {
        level: lesson.level,
        content: lesson.content
      }
    });

    await prisma.grammarQuestion.deleteMany({
      where: { lessonId: savedLesson.id }
    });

    for (const q of lesson.questions) {
      await prisma.grammarQuestion.create({
        data: {
          lessonId: savedLesson.id,
          type: q.type,
          prompt: q.prompt,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation
        }
      });
    }
  }

  const rootCount = await prisma.wordRoot.count();
  const relationCount = await prisma.wordRootRelation.count();
  console.log(
    `Seed complete: test account ${TEST_ACCOUNT_EMAIL} / ${TEST_ACCOUNT_PASSWORD}, ${words.length} words, ${lessons.length} lessons, ${rootCount} roots, ${relationCount} root-word relations`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
