'use client';

import type { ClozeItemDto, ClozeAttemptResultDto, ClozeStatsDto } from '@lexigram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  CloudOff,
  Lightbulb,
  PenLine,
  RotateCcw,
  SkipForward,
  XCircle
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { SyncButton } from '../../components/sync-button';
import { apiRequest } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { enqueueOfflineEvent } from '../../lib/offline-queue';
import { speakWord } from '../../lib/tts';

const SOURCE_OPTIONS = [
  { value: 'user-words', label: '仅生词本' },
  { value: 'word-bank', label: '仅词库' },
  { value: 'mixed', label: '混合（生词本 + 词库）' }
] as const;

const COUNT_OPTIONS = [5, 10, 15, 20] as const;

type Phase = 'setup' | 'playing' | 'result';
type FeedbackType = 'correct' | 'wrong' | null;

interface SessionResult {
  item: ClozeItemDto;
  userAnswer: string;
  correct: boolean;
  usedHint: boolean;
  skipped: boolean;
}

function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase();
}

function checkAnswer(userInput: string, targetWord: string): boolean {
  const normalizedInput = normalizeAnswer(userInput);
  const normalizedTarget = normalizeAnswer(targetWord);
  return normalizedInput === normalizedTarget;
}

export default function ClozePage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('setup');
  const [source, setSource] = useState<(typeof SOURCE_OPTIONS)[number]['value']>('user-words');
  const [count, setCount] = useState<number>(10);

  const [items, setItems] = useState<ClozeItemDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackType>(null);
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);
  const [submitMessage, setSubmitMessage] = useState('');
  const [stats, setStats] = useState<ClozeStatsDto | null>(null);
  const [loadError, setLoadError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const itemsQuery = useQuery({
    queryKey: ['cloze-items', source, count],
    queryFn: () =>
      apiRequest<ClozeItemDto[]>(
        `/cloze/items?count=${count}&source=${encodeURIComponent(source)}`
      ),
    enabled: false
  });

  const statsQuery = useQuery({
    queryKey: ['cloze-stats'],
    queryFn: () => apiRequest<ClozeStatsDto>('/cloze/stats'),
    enabled: phase === 'playing' || phase === 'result'
  });

  useEffect(() => {
    if (statsQuery.data) {
      setStats(statsQuery.data);
    }
  }, [statsQuery.data]);

  const submitMutation = useMutation({
    mutationFn: async (payload: {
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
    }) => {
      const clientEventId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const requestPayload = { ...payload, clientEventId };
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (!online) {
        await enqueueOfflineEvent({
          type: 'CLOZE_ATTEMPT',
          clientEventId,
          payload,
          createdAt: new Date().toISOString()
        });
        return { queued: true };
      }

      try {
        const response = await apiRequest<ClozeAttemptResultDto>('/cloze/attempts', {
          method: 'POST',
          body: JSON.stringify(requestPayload)
        });
        return { queued: false, response };
      } catch (_error) {
        await enqueueOfflineEvent({
          type: 'CLOZE_ATTEMPT',
          clientEventId,
          payload,
          createdAt: new Date().toISOString()
        });
        return { queued: true };
      }
    },
    onSuccess: (payload) => {
      if (payload.queued) {
        setSubmitMessage('当前离线，结果已加入待同步队列');
      } else {
        setSubmitMessage('提交成功');
      }
      void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['cloze-stats'] });
    }
  });

  const handleStart = useCallback(() => {
    setLoadError('');
    itemsQuery.refetch().then((result) => {
      if (result.data && result.data.length > 0) {
        setItems(result.data);
        setCurrentIndex(0);
        setUserInput('');
        setShowHint(false);
        setUsedHint(false);
        setFeedback(null);
        setSessionResults([]);
        setSubmitMessage('');
        setPhase('playing');
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }
    }).catch((error) => {
      setLoadError(error instanceof Error ? error.message : '加载题目失败，请稍后重试');
    });
  }, [itemsQuery]);

  const currentItem = items[currentIndex] ?? null;

  const calculateSessionStats = useCallback(() => {
    const answered = sessionResults.filter((r) => !r.skipped);
    const correctCount = answered.filter((r) => r.correct).length;
    const totalQuestions = answered.length;
    const accuracy = totalQuestions > 0
      ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
      : 0;
    return { correctCount, totalQuestions, accuracy };
  }, [sessionResults]);

  const handleSubmit = useCallback(() => {
    if (!currentItem) return;

    const trimmedInput = userInput.trim();

    if (!trimmedInput) {
      return;
    }

    const isCorrect = checkAnswer(trimmedInput, currentItem.targetWord);
    setFeedback(isCorrect ? 'correct' : 'wrong');

    const { correctCount, totalQuestions, accuracy } = calculateSessionStats();
    const newCorrectCount = correctCount + (isCorrect ? 1 : 0);
    const newTotalQuestions = totalQuestions + 1;
    const newAccuracy = newTotalQuestions > 0
      ? Number(((newCorrectCount / newTotalQuestions) * 100).toFixed(2))
      : 0;

    const result: SessionResult = {
      item: currentItem,
      userAnswer: trimmedInput,
      correct: isCorrect,
      usedHint,
      skipped: false
    };
    setSessionResults((prev) => [...prev, result]);

    const payload = {
      wordEntryId: currentItem.wordEntryId,
      targetWord: currentItem.targetWord,
      sentence: currentItem.fullSentence,
      userAnswer: trimmedInput,
      correct: isCorrect,
      usedHint,
      skipped: false,
      totalQuestions: newTotalQuestions,
      correctCount: newCorrectCount,
      accuracy: newAccuracy
    };

    submitMutation.mutate(payload);
  }, [currentItem, userInput, usedHint, calculateSessionStats, submitMutation]);

  const handleSkip = useCallback(() => {
    if (!currentItem) return;

    const { correctCount, totalQuestions, accuracy } = calculateSessionStats();

    const result: SessionResult = {
      item: currentItem,
      userAnswer: '',
      correct: false,
      usedHint: false,
      skipped: true
    };
    setSessionResults((prev) => [...prev, result]);

    const payload = {
      wordEntryId: currentItem.wordEntryId,
      targetWord: currentItem.targetWord,
      sentence: currentItem.fullSentence,
      userAnswer: '',
      correct: false,
      usedHint: false,
      skipped: true,
      totalQuestions,
      correctCount,
      accuracy
    };

    submitMutation.mutate(payload);
    setFeedback(null);
    handleNext();
  }, [currentItem, calculateSessionStats, submitMutation]);

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setUserInput('');
      setShowHint(false);
      setUsedHint(false);
      setFeedback(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setPhase('result');
    }
  }, [currentIndex, items.length]);

  const handleShowHint = useCallback(() => {
    setShowHint(true);
    setUsedHint(true);
  }, []);

  const handleRestart = useCallback(() => {
    setPhase('setup');
    setItems([]);
    setCurrentIndex(0);
    setUserInput('');
    setShowHint(false);
    setUsedHint(false);
    setFeedback(null);
    setSessionResults([]);
    setSubmitMessage('');
    setLoadError('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && feedback === null && userInput.trim()) {
        handleSubmit();
      } else if (e.key === 'Enter' && feedback !== null) {
        handleNext();
      }
    },
    [feedback, userInput, handleSubmit, handleNext]
  );

  const sessionStats = calculateSessionStats();

  if (!ready) return null;

  return (
    <AppShell title="例句填空">
      <div className="space-y-5" data-testid="cloze-page">
        <SyncButton
          onSynced={() => {
            void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
          }}
        />

        {phase === 'setup' && (
          <section className="card space-y-5 bg-white/95" data-testid="cloze-setup">
            <h2 className="section-title">
              <PenLine className="h-4 w-4 text-brand-600" aria-hidden="true" />
              填空设置
            </h2>

            {loadError && (
              <div className="status-warning" data-testid="cloze-load-error">
                {loadError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">单词来源</span>
                <select
                  className="input-control"
                  value={source}
                  onChange={(e) =>
                    setSource(e.target.value as (typeof SOURCE_OPTIONS)[number]['value'])
                  }
                  data-testid="cloze-source-select"
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">本轮题数</span>
                <select
                  className="input-control"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  data-testid="cloze-count-select"
                >
                  {COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} 题
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {stats && stats.totalAttempts > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      历史正确率：{stats.accuracy}%
                    </p>
                    <p className="text-xs text-amber-600">
                      累计练习 {stats.totalAttempts} 次，共 {stats.totalQuestions} 题
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleStart}
              disabled={itemsQuery.isFetching}
              data-testid="cloze-start-btn"
            >
              {itemsQuery.isFetching ? '加载中...' : '开始练习'}
            </button>
          </section>
        )}

        {phase === 'playing' && currentItem && (
          <section className="card space-y-5 bg-white/95" data-testid="cloze-playing">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600" data-testid="cloze-progress">
                第 {currentIndex + 1} / {items.length} 题
              </p>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200" data-testid="cloze-progress-bar-container">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
                  data-testid="cloze-progress-bar"
                />
              </div>
            </div>

            <div
              className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-slate-200 bg-slate-50/60 p-6"
              data-testid="cloze-sentence-area"
            >
              <p className="text-xs font-medium text-slate-600">请填写空格中的单词：</p>
              <p className="text-lg font-medium text-slate-800" data-testid="cloze-sentence-with-blank">
                {currentItem.sentenceWithBlank.split('_____').map((part, idx, arr) => (
                  <span key={idx}>
                    {part}
                    {idx < arr.length - 1 && (
                      <span
                        className={`mx-1 inline-block min-w-20 border-b-2 pb-0.5 align-baseline font-semibold ${
                          feedback === 'correct'
                            ? 'border-emerald-500 text-emerald-600'
                            : feedback === 'wrong'
                              ? 'border-red-500 text-red-600'
                              : 'border-brand-400 text-brand-600'
                        }`}
                      >
                        {feedback !== null ? currentItem.targetWord : showHint ? `${currentItem.targetWord[0]}...` : '_____'}
                      </span>
                    )}
                  </span>
                ))}
              </p>

              {feedback !== null && (
                <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="cloze-full-sentence">
                  <p className="text-xs font-medium text-slate-600">完整例句：</p>
                  <p className="mt-1 text-base text-slate-800">{currentItem.fullSentence}</p>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-600">单词释义：</p>
                <p className="mt-1 text-base text-slate-800" data-testid="cloze-definition">
                  {currentItem.definition}
                </p>
              </div>
            </div>

            {feedback === null ? (
              <div className="space-y-4" data-testid="cloze-input-area">
                <div className="space-y-2">
                  <label htmlFor="cloze-input" className="text-xs font-medium text-slate-600">
                    你的答案：
                  </label>
                  <input
                    id="cloze-input"
                    ref={inputRef}
                    type="text"
                    className="input-control text-lg"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="请输入空格处的单词..."
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-testid="cloze-input"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleShowHint}
                    disabled={showHint}
                    data-testid="cloze-hint-btn"
                  >
                    <Lightbulb className="h-4 w-4" aria-hidden="true" />
                    {showHint ? '已显示首字母' : '提示首字母'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSkip}
                    data-testid="cloze-skip-btn"
                  >
                    <SkipForward className="h-4 w-4" aria-hidden="true" />
                    跳过
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={handleSubmit}
                    disabled={!userInput.trim()}
                    data-testid="cloze-submit-btn"
                  >
                    提交答案
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4" data-testid="cloze-feedback-area">
                <div
                  className={`rounded-[var(--radius-control)] border p-4 ${
                    feedback === 'correct'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                  data-testid="cloze-result-feedback"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {feedback === 'correct' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
                      )}
                      <span
                        className={`text-sm font-semibold ${
                          feedback === 'correct' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {feedback === 'correct' ? '回答正确！' : '回答错误'}
                      </span>
                    </div>
                    {usedHint && (
                      <span className="text-xs text-amber-600">（使用了提示）</span>
                    )}
                  </div>

                  {feedback === 'wrong' && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-slate-600">你的答案：</p>
                      <p className="text-base text-red-700 line-through" data-testid="cloze-user-answer">
                        {userInput.trim()}
                      </p>
                      <p className="text-xs font-medium text-slate-600">正确答案：</p>
                      <p className="text-base font-semibold text-emerald-700" data-testid="cloze-correct-answer">
                        {currentItem.targetWord}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-primary w-full"
                  onClick={handleNext}
                  data-testid="cloze-next-btn"
                >
                  {currentIndex < items.length - 1 ? (
                    <span className="inline-flex items-center gap-1">
                      下一题
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : (
                    '查看结果'
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {phase === 'result' && (
          <section className="card space-y-5 bg-white/95" data-testid="cloze-result">
            <h2 className="section-title">
              <CheckCircle2 className="h-4 w-4 text-brand-600" aria-hidden="true" />
              本轮结果
            </h2>

            <div
              className="rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 p-6 text-center"
              data-testid="cloze-result-summary"
            >
              <p className="text-sm font-medium text-brand-600">本轮正确率</p>
              <p className="mt-2 text-4xl font-bold text-brand-700" data-testid="cloze-accuracy">
                {sessionStats.accuracy}%
              </p>
              <p className="mt-2 text-sm text-slate-600" data-testid="cloze-total-count">
                正确 {sessionStats.correctCount} / 总 {sessionStats.totalQuestions} 题
                {sessionResults.filter((r) => r.skipped).length > 0 && (
                  <span className="ml-2 text-slate-400">
                    （跳过 {sessionResults.filter((r) => r.skipped).length} 题）
                  </span>
                )}
              </p>
            </div>

            {stats && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-3">
                  <Lightbulb className="h-6 w-6 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      历史正确率：{stats.accuracy}%
                    </p>
                    <p className="text-xs text-amber-600">
                      累计练习 {stats.totalAttempts} 次，共 {stats.totalQuestions} 题
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3" data-testid="cloze-result-list">
              {sessionResults.map((result, idx) => (
                <div
                  key={idx}
                  className={`rounded-[var(--radius-control)] border p-3 ${
                    result.skipped
                      ? 'border-slate-200 bg-slate-50/60'
                      : result.correct
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-red-200 bg-red-50/60'
                  }`}
                  data-testid={`cloze-result-item-${idx}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {result.skipped ? (
                        <SkipForward className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" aria-hidden="true" />
                      ) : result.correct ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-medium text-slate-700">{result.item.fullSentence}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          目标词：<span className="font-semibold text-brand-600">{result.item.targetWord}</span>
                        </p>
                        {!result.skipped && !result.correct && (
                          <p className="mt-1 text-xs text-red-500">
                            你的答案：{result.userAnswer}
                          </p>
                        )}
                        {result.usedHint && (
                          <p className="mt-1 text-xs text-amber-500">使用了提示</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold shrink-0 ${
                        result.skipped
                          ? 'text-slate-400'
                          : result.correct
                            ? 'text-emerald-700'
                            : 'text-red-700'
                      }`}
                    >
                      {result.skipped ? '跳过' : result.correct ? '正确' : '错误'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {submitMessage && (
              <div
                className={submitMessage.includes('离线') ? 'status-warning' : 'status-success'}
                data-testid="cloze-submit-msg"
              >
                {submitMessage.includes('离线') ? (
                  <CloudOff className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                )}
                {submitMessage}
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleRestart}
              data-testid="cloze-restart-btn"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              再来一轮
            </button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
