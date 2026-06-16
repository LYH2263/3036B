'use client';

import type { MatchGameWordDto, MatchGameAttemptResultDto, MatchGameBestScoreDto } from '@lexigram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Flame,
  Gamepad2,
  RotateCcw,
  Trophy,
  XCircle,
  Zap
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../../components/app-shell';
import { apiRequest } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/auth';

type Difficulty = 'easy' | 'normal' | 'hard';
type Phase = 'setup' | 'playing' | 'result';
type CellSide = 'en' | 'zh';

interface CellItem {
  id: string;
  pairId: string;
  text: string;
  side: CellSide;
}

const DIFFICULTY_OPTIONS: Array<{
  value: Difficulty;
  label: string;
  desc: string;
  count: number;
  timeSec: number;
}> = [
  { value: 'easy', label: '简单', desc: '6 词 / 120 秒', count: 6, timeSec: 120 },
  { value: 'normal', label: '普通', desc: '10 词 / 90 秒', count: 10, timeSec: 90 },
  { value: 'hard', label: '困难', desc: '15 词 / 60 秒', count: 15, timeSec: 60 }
];

const SCORE_BASE = 100;
const COMBO_BONUS = 50;
const ERROR_PENALTY_SEC = 3;
const LOCAL_BEST_KEY = 'match-game-best';

function getDifficultyConfig(d: Difficulty) {
  return DIFFICULTY_OPTIONS.find((o) => o.value === d) ?? DIFFICULTY_OPTIONS[1];
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function loadLocalBest(): Record<string, { score: number; combo: number }> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_BEST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalBest(difficulty: string, score: number, combo: number) {
  try {
    const current = loadLocalBest();
    const prev = current[difficulty];
    if (!prev || score > prev.score || (score === prev.score && combo > prev.combo)) {
      current[difficulty] = { score, combo };
      localStorage.setItem(LOCAL_BEST_KEY, JSON.stringify(current));
    }
  } catch {}
}

export default function MatchGamePage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [words, setWords] = useState<MatchGameWordDto[]>([]);
  const [enCells, setEnCells] = useState<CellItem[]>([]);
  const [zhCells, setZhCells] = useState<CellItem[]>([]);
  const [selectedEn, setSelectedEn] = useState<string | null>(null);
  const [selectedZh, setSelectedZh] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [errorPair, setErrorPair] = useState<{ en: string; zh: string } | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeUsed, setTimeUsed] = useState(0);
  const [won, setWon] = useState(false);
  const [attemptResult, setAttemptResult] = useState<MatchGameAttemptResultDto | null>(null);
  const [submitMessage, setSubmitMessage] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const maxComboRef = useRef(0);
  const matchedRef = useRef(new Set<string>());
  const wordsRef = useRef<MatchGameWordDto[]>([]);
  const submitRef = useRef<((payload: {
    difficulty: string;
    wordCount: number;
    timeLimitSec: number;
    score: number;
    maxCombo: number;
    matchedCount: number;
    totalWords: number;
    timeUsedSec: number;
    won: boolean;
  }) => void) | null>(null);

  useEffect(() => {
    scoreRef.current = score;
    maxComboRef.current = maxCombo;
    matchedRef.current = matchedIds;
    wordsRef.current = words;
  }, [score, maxCombo, matchedIds, words]);

  const config = useMemo(() => getDifficultyConfig(difficulty), [difficulty]);
  const localBest = useMemo(() => loadLocalBest(), []);

  const wordsQuery = useQuery({
    queryKey: ['match-game-words', difficulty],
    queryFn: () =>
      apiRequest<MatchGameWordDto[]>(
        `/match-game/words?count=${config.count}&difficulty=${difficulty}`
      ),
    enabled: false
  });

  const bestScoreQuery = useQuery({
    queryKey: ['match-game-best', difficulty],
    queryFn: () =>
      apiRequest<MatchGameBestScoreDto>(`/match-game/best-score?difficulty=${difficulty}`),
    enabled: ready
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      difficulty: string;
      wordCount: number;
      timeLimitSec: number;
      score: number;
      maxCombo: number;
      matchedCount: number;
      totalWords: number;
      timeUsedSec: number;
      won: boolean;
    }) => {
      const clientEventId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (!online) {
        saveLocalBest(payload.difficulty, payload.score, payload.maxCombo);
        return { queued: true } as const;
      }

      try {
        const response = await apiRequest<MatchGameAttemptResultDto>('/match-game/attempts', {
          method: 'POST',
          body: JSON.stringify({ ...payload, clientEventId })
        });
        saveLocalBest(payload.difficulty, payload.score, payload.maxCombo);
        return { queued: false, response } as const;
      } catch {
        saveLocalBest(payload.difficulty, payload.score, payload.maxCombo);
        return { queued: true } as const;
      }
    },
    onSuccess: (payload) => {
      if (payload.queued) {
        setSubmitMessage('当前离线，成绩已保存到本地');
        setAttemptResult(null);
      } else {
        setAttemptResult(payload.response ?? null);
        setSubmitMessage('成绩已记录');
      }
      void queryClient.invalidateQueries({ queryKey: ['match-game-best'] });
    }
  });

  useEffect(() => {
    submitRef.current = submitMutation.mutate;
  }, [submitMutation.mutate]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStart = useCallback(() => {
    wordsQuery.refetch().then((result) => {
      if (result.data && result.data.length > 0) {
        const fetched = result.data;
        setWords(fetched);

        const enItems: CellItem[] = fetched.map((w) => ({
          id: `en-${w.id}`,
          pairId: w.id,
          text: w.word,
          side: 'en'
        }));

        const zhItems: CellItem[] = shuffleArray(
          fetched.map((w) => ({
            id: `zh-${w.id}`,
            pairId: w.id,
            text: w.definition,
            side: 'zh'
          }))
        );

        setEnCells(enItems);
        setZhCells(zhItems);
        setSelectedEn(null);
        setSelectedZh(null);
        setMatchedIds(new Set());
        setErrorPair(null);
        setScore(0);
        setCombo(0);
        setMaxCombo(0);
        setTimeUsed(0);
        setWon(false);
        setAttemptResult(null);
        setSubmitMessage('');

        const timeLimit = config.timeSec;
        setTimeLeft(timeLimit);
        const now = Date.now();
        startTimeRef.current = now;

        clearTimer();

        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - now) / 1000);
          const remaining = timeLimit - elapsed;
          setTimeUsed(elapsed);

          if (remaining <= 0) {
            clearTimer();
            setTimeLeft(0);
            setPhase('result');
            setWon(false);
            setTimeUsed(elapsed);
            submitRef.current?.({
              difficulty,
              wordCount: wordsRef.current.length,
              timeLimitSec: timeLimit,
              score: scoreRef.current,
              maxCombo: maxComboRef.current,
              matchedCount: matchedRef.current.size / 2,
              totalWords: wordsRef.current.length,
              timeUsedSec: elapsed,
              won: false
            });
          } else {
            setTimeLeft(remaining);
          }
        }, 200);

        setPhase('playing');
      }
    });
  }, [wordsQuery, config, difficulty, clearTimer]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const checkMatch = useCallback(
    (enId: string, zhId: string) => {
      const enCell = enCells.find((c) => c.id === enId);
      const zhCell = zhCells.find((c) => c.id === zhId);

      if (!enCell || !zhCell) return;

      if (enCell.pairId === zhCell.pairId) {
        const newCombo = combo + 1;
        const comboMax = Math.max(maxCombo, newCombo);
        const points = SCORE_BASE + (newCombo - 1) * COMBO_BONUS;
        const newScore = score + points;

        setCombo(newCombo);
        setMaxCombo(comboMax);
        setScore(newScore);

        const newMatched = new Set(matchedIds);
        newMatched.add(enId);
        newMatched.add(zhId);
        setMatchedIds(newMatched);

        setSelectedEn(null);
        setSelectedZh(null);

        if (newMatched.size === enCells.length + zhCells.length) {
          clearTimer();
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          setTimeUsed(elapsed);
          setWon(true);
          setPhase('result');

          submitRef.current?.({
            difficulty,
            wordCount: words.length,
            timeLimitSec: config.timeSec,
            score: newScore,
            maxCombo: comboMax,
            matchedCount: newMatched.size / 2,
            totalWords: words.length,
            timeUsedSec: elapsed,
            won: true
          });
        }
      } else {
        setErrorPair({ en: enId, zh: zhId });
        setCombo(0);

        setTimeLeft((prev) => Math.max(0, prev - ERROR_PENALTY_SEC));

        setTimeout(() => {
          setErrorPair(null);
          setSelectedEn(null);
          setSelectedZh(null);
        }, 600);
      }
    },
    [enCells, zhCells, combo, maxCombo, score, matchedIds, words, difficulty, config, clearTimer]
  );

  useEffect(() => {
    if (selectedEn && selectedZh) {
      checkMatch(selectedEn, selectedZh);
    }
  }, [selectedEn, selectedZh, checkMatch]);

  const handleEnClick = useCallback(
    (id: string) => {
      if (matchedIds.has(id) || errorPair) return;
      setSelectedEn(id);
    },
    [matchedIds, errorPair]
  );

  const handleZhClick = useCallback(
    (id: string) => {
      if (matchedIds.has(id) || errorPair) return;
      setSelectedZh(id);
    },
    [matchedIds, errorPair]
  );

  const handleRestart = useCallback(() => {
    clearTimer();
    setPhase('setup');
    setWords([]);
    setEnCells([]);
    setZhCells([]);
    setSelectedEn(null);
    setSelectedZh(null);
    setMatchedIds(new Set());
    setErrorPair(null);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setTimeLeft(0);
    setTimeUsed(0);
    setWon(false);
    setAttemptResult(null);
    setSubmitMessage('');
  }, [clearTimer]);

  const timeLeftPercent = config.timeSec > 0 ? (timeLeft / config.timeSec) * 100 : 0;
  const timeColor =
    timeLeftPercent > 50 ? 'bg-emerald-500' : timeLeftPercent > 20 ? 'bg-amber-500' : 'bg-red-500';

  const bestForDifficulty = localBest[difficulty];

  return (
    <AppShell title="单词配对">
      <div className="space-y-5" data-testid="match-game-page">
        {phase === 'setup' && (
          <section className="card space-y-5 bg-white/95" data-testid="match-game-setup">
            <h2 className="section-title">
              <Gamepad2 className="h-4 w-4 text-brand-600" aria-hidden="true" />
              游戏设置
            </h2>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-600">选择难度</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`rounded-[var(--radius-control)] border p-3 text-left transition-all ${
                      difficulty === opt.value
                        ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                        : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                    }`}
                    onClick={() => setDifficulty(opt.value)}
                    data-testid={`match-difficulty-${opt.value}`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {bestForDifficulty && (
              <div
                className="status-neutral flex items-center gap-2"
                data-testid="match-game-local-best"
              >
                <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <span>
                  本地最佳：{bestForDifficulty.score} 分 / 连击 {bestForDifficulty.combo}
                </span>
              </div>
            )}

            {bestScoreQuery.data && bestScoreQuery.data.totalGames > 0 && (
              <div
                className="status-neutral flex items-center gap-2"
                data-testid="match-game-server-stats"
              >
                <Zap className="h-4 w-4 text-brand-500" aria-hidden="true" />
                <span>
                  已玩 {bestScoreQuery.data.totalGames} 局 / 胜 {bestScoreQuery.data.totalWins} /
                  最高 {bestScoreQuery.data.bestScore} 分
                </span>
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleStart}
              disabled={wordsQuery.isFetching}
              data-testid="match-game-start-btn"
            >
              {wordsQuery.isFetching ? '加载中...' : '开始游戏'}
            </button>
          </section>
        )}

        {phase === 'playing' && (
          <section className="space-y-4" data-testid="match-game-playing">
            <div className="card bg-white/95 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="stat-label">
                    <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                    <span data-testid="match-score">{score}</span>
                  </div>
                  <div className="stat-label">
                    <Flame
                      className={`h-3.5 w-3.5 ${combo >= 3 ? 'text-orange-500' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                    <span data-testid="match-combo">×{combo}</span>
                    {combo >= 3 && (
                      <span className="text-xs text-orange-500">
                        +{(combo - 1) * COMBO_BONUS}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock
                    className={`h-3.5 w-3.5 ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      timeLeft <= 10 ? 'text-red-600' : 'text-slate-700'
                    }`}
                    data-testid="match-timer"
                  >
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${timeColor}`}
                  style={{ width: `${timeLeftPercent}%` }}
                  data-testid="match-timer-bar"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  已配对 {matchedIds.size / 2} / {enCells.length}
                </span>
                <span>
                  错误扣时 {ERROR_PENALTY_SEC} 秒/次
                </span>
              </div>
            </div>

            <div
              className="grid grid-cols-2 gap-3 sm:gap-4"
              data-testid="match-game-board"
            >
              <div className="space-y-2">
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  English
                </p>
                {enCells.map((cell) => {
                  const isSelected = selectedEn === cell.id;
                  const isMatched = matchedIds.has(cell.id);
                  const isError = errorPair?.en === cell.id;

                  return (
                    <button
                      key={cell.id}
                      type="button"
                      disabled={isMatched}
                      className={`w-full rounded-[var(--radius-control)] border p-3 text-left text-sm font-medium transition-all duration-200 ${
                        isMatched
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-400 line-through opacity-50 scale-95'
                          : isError
                            ? 'border-red-400 bg-red-50 text-red-700 animate-shake'
                            : isSelected
                              ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200 scale-[1.02]'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      onClick={() => handleEnClick(cell.id)}
                      data-testid={`match-cell-${cell.id}`}
                    >
                      {cell.text}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  中文释义
                </p>
                {zhCells.map((cell) => {
                  const isSelected = selectedZh === cell.id;
                  const isMatched = matchedIds.has(cell.id);
                  const isError = errorPair?.zh === cell.id;

                  return (
                    <button
                      key={cell.id}
                      type="button"
                      disabled={isMatched}
                      className={`w-full rounded-[var(--radius-control)] border p-3 text-left text-sm transition-all duration-200 ${
                        isMatched
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-400 line-through opacity-50 scale-95'
                          : isError
                            ? 'border-red-400 bg-red-50 text-red-700 animate-shake'
                            : isSelected
                              ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200 scale-[1.02]'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      onClick={() => handleZhClick(cell.id)}
                      data-testid={`match-cell-${cell.id}`}
                    >
                      {cell.text}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {phase === 'result' && (
          <section className="card space-y-5 bg-white/95" data-testid="match-game-result">
            <h2 className="section-title">
              {won ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
              )}
              {won ? '恭喜过关！' : '时间到'}
            </h2>

            <div
              className={`rounded-[var(--radius-card)] border p-6 text-center ${
                won
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
              }`}
              data-testid="match-game-result-summary"
            >
              <p className={`text-sm font-medium ${won ? 'text-emerald-600' : 'text-red-600'}`}>
                {won ? '全部配对成功' : '未能在限时内完成'}
              </p>

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-500">得分</p>
                  <p
                    className="mt-1 text-2xl font-bold text-brand-700"
                    data-testid="match-result-score"
                  >
                    {score}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">最大连击</p>
                  <p
                    className="mt-1 text-2xl font-bold text-orange-600"
                    data-testid="match-result-combo"
                  >
                    ×{maxCombo}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">用时</p>
                  <p
                    className="mt-1 text-2xl font-bold text-slate-700"
                    data-testid="match-result-time"
                  >
                    {timeUsed.toFixed(1)}s
                  </p>
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-500" data-testid="match-result-matched">
                配对 {matchedIds.size / 2} / {enCells.length || words.length}
              </div>
            </div>

            {attemptResult && (
              <div className="status-success" data-testid="match-game-attempt-result">
                <CheckCircle2 className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                成绩已记录 — 得分 {attemptResult.score} / 连击 {attemptResult.maxCombo}
              </div>
            )}

            {submitMessage && !attemptResult && (
              <div className="status-warning" data-testid="match-game-submit-msg">
                {submitMessage}
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleRestart}
              data-testid="match-game-restart-btn"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              再来一局
            </button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
