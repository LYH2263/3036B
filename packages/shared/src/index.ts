export type GrammarLevel = 'basic' | 'intermediate' | 'advanced';

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface WordEntryDto {
  id: string;
  word: string;
  definition: string;
  exampleSentence: string;
  phonetic: string;
  etymology: string;
}

export interface UserWordProgressDto {
  id: string;
  wordEntryId: string;
  status: 'learning' | 'known';
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
  word: WordEntryDto;
}

export interface GrammarQuestionDto {
  id: string;
  type: 'single_choice' | 'fill_blank';
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface GrammarLessonDto {
  id: string;
  title: string;
  level: GrammarLevel;
  content: string;
  questions: GrammarQuestionDto[];
}

export interface GrammarAttemptDto {
  id: string;
  lessonId: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  createdAt: string;
}

export interface AchievementDto {
  code: string;
  title: string;
  description: string;
}

export interface StatsOverviewDto {
  todayReviewCount: number;
  todayNewWords: number;
  vocabularyTotal: number;
  totalReviews: number;
  grammarAttempts: number;
  grammarCorrectRate: number;
  dictationAttempts: number;
  dictationAccuracy: number;
  speakingAttempts: number;
  speakingAverageScore: number;
  clozeAttempts: number;
  clozeAccuracy: number;
  streakDays: number;
  achievements: AchievementDto[];
}

export type OfflineQueueEvent = WordReviewEvent | GrammarAttemptEvent | DictationAttemptEvent | SpeakingAttemptEvent | ClozeAttemptEvent;

export interface WordReviewEvent {
  type: 'WORD_REVIEW';
  clientEventId: string;
  payload: {
    progressId: string;
    known: boolean;
  };
  createdAt: string;
}

export interface GrammarAttemptEvent {
  type: 'GRAMMAR_ATTEMPT';
  clientEventId: string;
  payload: {
    lessonId: string;
    answers: Array<{ questionId: string; answer: string }>;
  };
  createdAt: string;
}

export interface DictationWordDto {
  id: string;
  word: string;
  definition: string;
  exampleSentence: string;
  phonetic: string;
}

export interface DictationWordResult {
  wordEntryId: string;
  userInput: string;
  correctWord: string;
  exampleSentence?: string;
  correct: boolean;
}

export interface DictationAttemptResultDto {
  deduplicated: boolean;
  id: string;
  totalWords: number;
  correctCount: number;
  accuracy: number;
  createdAt: string;
}

export interface DictationAttemptEvent {
  type: 'DICTATION_ATTEMPT';
  clientEventId: string;
  payload: {
    wordResults: Array<{
      wordEntryId: string;
      userInput: string;
      correctWord: string;
      exampleSentence?: string;
      correct: boolean;
    }>;
  };
  createdAt: string;
}

export interface MatchGameWordDto {
  id: string;
  word: string;
  definition: string;
}

export interface MatchGameAttemptResultDto {
  deduplicated: boolean;
  id: string;
  score: number;
  maxCombo: number;
  matchedCount: number;
  totalWords: number;
  timeUsedSec: number;
  won: boolean;
  createdAt: string;
}

export interface MatchGameBestScoreDto {
  difficulty: string;
  bestScore: number;
  bestCombo: number;
  totalGames: number;
  totalWins: number;
}

export type SpeakingPracticeMode = 'word' | 'sentence';

export interface SpeakingWordDto {
  id: string;
  wordEntryId: string;
  text: string;
  definition: string;
  phonetic: string;
  mode: SpeakingPracticeMode;
}

export interface SpeakingWordResult {
  word: string;
  recognized: string;
  matchType: 'correct' | 'wrong' | 'missing' | 'extra';
  similarity: number;
}

export interface SpeakingAttemptResultDto {
  deduplicated: boolean;
  id: string;
  targetText: string;
  recognizedText: string;
  similarityScore: number;
  totalWords: number;
  correctCount: number;
  wordResults: SpeakingWordResult[];
  practiceMode: SpeakingPracticeMode;
  createdAt: string;
}

export interface SpeakingAttemptEvent {
  type: 'SPEAKING_ATTEMPT';
  clientEventId: string;
  payload: {
    wordEntryId?: string;
    targetText: string;
    recognizedText: string;
    similarityScore: number;
    wordResults: SpeakingWordResult[];
    totalWords: number;
    correctCount: number;
    practiceMode: SpeakingPracticeMode;
  };
  createdAt: string;
}

export interface SpeakingBestScoreDto {
  practiceMode: SpeakingPracticeMode;
  bestScore: number;
  totalAttempts: number;
  averageScore: number;
}

export interface ClozeItemDto {
  id: string;
  wordEntryId: string;
  targetWord: string;
  definition: string;
  sentenceWithBlank: string;
  fullSentence: string;
  blankIndex: number;
}

export interface ClozeAttemptResultDto {
  deduplicated: boolean;
  id: string;
  wordEntryId: string;
  targetWord: string;
  sentence: string;
  userAnswer: string;
  correct: boolean;
  usedHint: boolean;
  skipped: boolean;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  createdAt: string;
}

export interface ClozeAttemptEvent {
  type: 'CLOZE_ATTEMPT';
  clientEventId: string;
  payload: {
    wordEntryId: string;
    targetWord: string;
    sentence: string;
    userAnswer: string;
    correct: boolean;
    usedHint: boolean;
    skipped: boolean;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
  };
  createdAt: string;
}

export interface ClozeStatsDto {
  totalAttempts: number;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
}

export interface ImportCandidateWord {
  wordEntryId: string;
  word: string;
  phonetic: string;
  definition: string;
  frequency: number;
}

export interface ImportParseResultDto {
  candidates: ImportCandidateWord[];
  totalExtracted: number;
  stopwordsFiltered: number;
  masteredFiltered: number;
  notInDictionary: string[];
}

export interface BatchAddResultDto {
  added: number;
  alreadyExists: number;
  notFound: number;
  details: Array<{
    wordEntryId: string;
    word: string;
    status: 'added' | 'already_exists' | 'not_found';
  }>;
}

export type RootType = 'root' | 'prefix' | 'suffix';

export interface WordRootDto {
  id: string;
  root: string;
  type: RootType;
  meaning: string;
  origin: string;
  exampleWords: string;
  derivedWordsCount: number;
}

export interface DerivedWordDto extends WordEntryDto {
  position: string;
}

export interface WordRootDetailDto extends WordRootDto {
  derivedWords: DerivedWordDto[];
}

export interface DailyWordDto {
  id: string;
  date: string;
  learned: boolean;
  word: WordEntryDto;
}

export interface DailyWordHistoryDto {
  items: DailyWordDto[];
  total: number;
}
