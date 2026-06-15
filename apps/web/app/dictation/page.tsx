'use client';

import type { DictationWordDto, DictationAttemptResultDto } from '@lexigram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  CloudOff,
  Headphones,
  RefreshCw,
  RotateCcw,
  Volume2,
  XCircle
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { SyncButton } from '../../components/sync-button';
import { apiRequest } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { enqueueOfflineEvent } from '../../lib/offline-queue';
import {
  isSpeechSynthesisSupported,
  listSpeechVoices,
  speakWord,
  type SpeechVoiceOption
} from '../../lib/tts';

const ACCENT_OPTIONS = [
  { value: 'auto', label: '系统默认' },
  { value: 'en-US', label: '美式英语（en-US）' },
  { value: 'en-GB', label: '英式英语（en-GB）' },
  { value: 'en-AU', label: '澳式英语（en-AU）' },
  { value: 'en-CA', label: '加式英语（en-AU）' },
  { value: 'en-IN', label: '印式英语（en-IN）' }
] as const;

const SOURCE_OPTIONS = [
  { value: 'mixed', label: '混合（生词本 + 词库）' },
  { value: 'user-words', label: '仅生词本' },
  { value: 'word-bank', label: '仅词库' }
] as const;

const COUNT_OPTIONS = [5, 10, 15, 20] as const;

const RATE_OPTIONS = [
  { value: 0.5, label: '0.5x 慢速' },
  { value: 0.7, label: '0.7x 较慢' },
  { value: 0.85, label: '0.85x 稍慢' },
  { value: 0.95, label: '0.95x 正常' },
  { value: 1.1, label: '1.1x 稍快' },
  { value: 1.3, label: '1.3x 较快' }
] as const;

const AUTO_VOICE_VALUE = '__auto__';

type Phase = 'setup' | 'playing' | 'result';

function normalizeForCompare(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.!,;:'"?(){}[\]]/g, '');
}

function charDiff(
  userInput: string,
  correctWord: string
): Array<{ char: string; type: 'correct' | 'wrong' | 'missing' }> {
  const a = userInput.trim().toLowerCase();
  const b = correctWord.trim().toLowerCase();

  const result: Array<{ char: string; type: 'correct' | 'wrong' | 'missing' }> = [];
  const maxLen = Math.max(a.length, b.length);

  for (let i = 0; i < maxLen; i++) {
    if (i >= a.length) {
      result.push({ char: b[i], type: 'missing' });
    } else if (i >= b.length) {
      result.push({ char: a[i], type: 'wrong' });
    } else if (a[i] === b[i]) {
      result.push({ char: a[i], type: 'correct' });
    } else {
      result.push({ char: a[i], type: 'wrong' });
    }
  }

  return result;
}

export default function DictationPage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('setup');
  const [source, setSource] = useState<(typeof SOURCE_OPTIONS)[number]['value']>('mixed');
  const [count, setCount] = useState<number>(10);
  const [accent, setAccent] = useState<(typeof ACCENT_OPTIONS)[number]['value']>('auto');
  const [rate, setRate] = useState<number>(0.95);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(AUTO_VOICE_VALUE);
  const [voiceOptions, setVoiceOptions] = useState<SpeechVoiceOption[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);

  const [words, setWords] = useState<DictationWordDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [wordResults, setWordResults] = useState<
    Array<{
      wordEntryId: string;
      userInput: string;
      correctWord: string;
      exampleSentence: string;
      correct: boolean;
    }>
  >([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [attemptResult, setAttemptResult] = useState<DictationAttemptResultDto | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = isSpeechSynthesisSupported();
    setSpeechSupported(supported);
    if (!supported) return;

    const syncVoices = () => setVoiceOptions(listSpeechVoices());
    syncVoices();

    const synth = window.speechSynthesis as SpeechSynthesis & {
      addEventListener?: (type: string, callback: () => void) => void;
      removeEventListener?: (type: string, callback: () => void) => void;
    };

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', syncVoices);
      return () => {
        if (typeof synth.removeEventListener === 'function') {
          synth.removeEventListener('voiceschanged', syncVoices);
        }
      };
    }
  }, []);

  const filteredVoiceOptions = useMemo(() => {
    if (accent === 'auto') return voiceOptions;
    const target = accent.toLowerCase();
    const prefix = target.split('-')[0];
    return voiceOptions.filter((voice) => {
      const lang = voice.lang.toLowerCase();
      return lang === target || lang.startsWith(`${prefix}-`);
    });
  }, [accent, voiceOptions]);

  useEffect(() => {
    if (selectedVoiceURI === AUTO_VOICE_VALUE) return;
    const matched = filteredVoiceOptions.some((item) => item.voiceURI === selectedVoiceURI);
    if (!matched) setSelectedVoiceURI(AUTO_VOICE_VALUE);
  }, [filteredVoiceOptions, selectedVoiceURI]);

  const wordsQuery = useQuery({
    queryKey: ['dictation-words', source, count],
    queryFn: () =>
      apiRequest<DictationWordDto[]>(
        `/dictation/words?count=${count}&source=${encodeURIComponent(source)}`
      ),
    enabled: false
  });

  const submitMutation = useMutation({
    mutationFn: async (results: typeof wordResults) => {
      const clientEventId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const payload = {
        wordResults: results.map((r) => ({
          wordEntryId: r.wordEntryId,
          userInput: r.userInput,
          correctWord: r.correctWord,
          exampleSentence: r.exampleSentence,
          correct: r.correct
        })),
        clientEventId
      };

      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (!online) {
        await enqueueOfflineEvent({
          type: 'DICTATION_ATTEMPT',
          clientEventId,
          payload: { wordResults: payload.wordResults },
          createdAt: new Date().toISOString()
        });
        return { queued: true };
      }

      try {
        const response = await apiRequest<DictationAttemptResultDto>('/dictation/attempts', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        return { queued: false, response };
      } catch (_error) {
        await enqueueOfflineEvent({
          type: 'DICTATION_ATTEMPT',
          clientEventId,
          payload: { wordResults: payload.wordResults },
          createdAt: new Date().toISOString()
        });
        return { queued: true };
      }
    },
    onSuccess: (payload) => {
      if (payload.queued) {
        setSubmitMessage('当前离线，听写结果已加入待同步队列');
        setAttemptResult(null);
      } else {
        setAttemptResult(payload.response ?? null);
        setSubmitMessage('提交成功');
      }
      void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
    }
  });

  const handleStart = useCallback(() => {
    wordsQuery.refetch().then((result) => {
      if (result.data && result.data.length > 0) {
        setWords(result.data);
        setCurrentIndex(0);
        setUserInput('');
        setWordResults([]);
        setShowFeedback(false);
        setAttemptResult(null);
        setSubmitMessage('');
        setPhase('playing');
        setTimeout(() => {
          const currentWord = result.data[0];
          speakWord(currentWord.word, {
            lang: accent === 'auto' ? undefined : accent,
            voiceURI: selectedVoiceURI === AUTO_VOICE_VALUE ? undefined : selectedVoiceURI,
            rate
          });
        }, 300);
      }
    });
  }, [wordsQuery, accent, selectedVoiceURI, rate]);

  const currentWord = words[currentIndex] ?? null;

  const handlePlay = useCallback(() => {
    if (!currentWord) return;
    speakWord(currentWord.word, {
      lang: accent === 'auto' ? undefined : accent,
      voiceURI: selectedVoiceURI === AUTO_VOICE_VALUE ? undefined : selectedVoiceURI,
      rate
    });
  }, [currentWord, accent, selectedVoiceURI, rate]);

  const handleSubmitWord = useCallback(() => {
    if (!currentWord) return;

    const isCorrect = normalizeForCompare(userInput) === normalizeForCompare(currentWord.word);

    const result = {
      wordEntryId: currentWord.id,
      userInput: userInput.trim(),
      correctWord: currentWord.word,
      exampleSentence: currentWord.exampleSentence,
      correct: isCorrect
    };

    setWordResults((prev) => [...prev, result]);
    setShowFeedback(true);
  }, [currentWord, userInput]);

  const handleNext = useCallback(() => {
    if (currentIndex < words.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setUserInput('');
      setShowFeedback(false);
      setTimeout(() => {
        const nextWord = words[nextIndex];
        speakWord(nextWord.word, {
          lang: accent === 'auto' ? undefined : accent,
          voiceURI: selectedVoiceURI === AUTO_VOICE_VALUE ? undefined : selectedVoiceURI,
          rate
        });
      }, 300);
    } else {
      setPhase('result');
      const results = [...wordResults];
      submitMutation.mutate(results);
    }
  }, [currentIndex, words, accent, selectedVoiceURI, rate, wordResults, submitMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (showFeedback) {
          handleNext();
        } else if (userInput.trim()) {
          handleSubmitWord();
        }
      }
    },
    [showFeedback, handleNext, handleSubmitWord, userInput]
  );

  const handleRestart = useCallback(() => {
    setPhase('setup');
    setWords([]);
    setCurrentIndex(0);
    setUserInput('');
    setWordResults([]);
    setShowFeedback(false);
    setAttemptResult(null);
    setSubmitMessage('');
  }, []);

  const correctCount = wordResults.filter((r) => r.correct).length;
  const accuracy =
    wordResults.length > 0
      ? Number(((correctCount / wordResults.length) * 100).toFixed(1))
      : 0;

  useEffect(() => {
    if (phase === 'playing' && !showFeedback && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, currentIndex, showFeedback]);

  return (
    <AppShell title="听写练习">
      <div className="space-y-5" data-testid="dictation-page">
        <SyncButton
          onSynced={() => {
            void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
          }}
        />

        {phase === 'setup' && (
          <section
            className="card space-y-5 bg-white/95"
            data-testid="dictation-setup"
          >
            <h2 className="section-title">
              <Headphones className="h-4 w-4 text-brand-600" aria-hidden="true" />
              听写设置
            </h2>

            {!speechSupported && (
              <div className="status-warning" data-testid="dictation-speech-warning">
                当前浏览器不支持语音播放，请使用最新版 Chrome 或 Edge 体验听写功能。
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
                  data-testid="dictation-source-select"
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">本轮数量</span>
                <select
                  className="input-control"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  data-testid="dictation-count-select"
                >
                  {COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} 个单词
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">发音口音</span>
                <select
                  className="input-control"
                  value={accent}
                  onChange={(e) =>
                    setAccent(e.target.value as (typeof ACCENT_OPTIONS)[number]['value'])
                  }
                  data-testid="dictation-accent-select"
                >
                  {ACCENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">语速</span>
                <select
                  className="input-control"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  data-testid="dictation-rate-select"
                >
                  {RATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-slate-600">发音人</span>
                <select
                  className="input-control"
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  data-testid="dictation-voice-select"
                  disabled={!speechSupported}
                >
                  <option value={AUTO_VOICE_VALUE}>系统自动匹配</option>
                  {filteredVoiceOptions.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}（{voice.lang}）
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={handleStart}
              disabled={wordsQuery.isFetching}
              data-testid="dictation-start-btn"
            >
              {wordsQuery.isFetching ? '加载中...' : '开始听写'}
            </button>
          </section>
        )}

        {phase === 'playing' && currentWord && (
          <section
            className="card space-y-5 bg-white/95"
            data-testid="dictation-playing"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600" data-testid="dictation-progress">
                第 {currentIndex + 1} / {words.length} 题
              </p>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200" data-testid="dictation-progress-bar-container">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
                  data-testid="dictation-progress-bar"
                />
              </div>
            </div>

            <div
              className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-slate-200 bg-slate-50/60 p-6"
              data-testid="dictation-word-area"
            >
              <button
                type="button"
                className="btn-secondary h-14 w-14 rounded-full"
                onClick={handlePlay}
                data-testid="dictation-play-btn"
                aria-label="播放发音"
              >
                <Volume2 className="h-6 w-6" aria-hidden="true" />
              </button>
              <p className="text-sm text-slate-500">
                点击播放按钮听取发音，或按下方按钮重复播放
              </p>
            </div>

            {!showFeedback ? (
              <div className="space-y-3" data-testid="dictation-input-area">
                <input
                  ref={inputRef}
                  className="input-control text-center text-lg"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="请输入听到的单词"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-testid="dictation-input"
                />
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handlePlay}
                    data-testid="dictation-replay-btn"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    重新播放
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSubmitWord}
                    disabled={!userInput.trim()}
                    data-testid="dictation-submit-word-btn"
                  >
                    提交答案
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4" data-testid="dictation-feedback-area">
                <div
                  className={`rounded-[var(--radius-control)] border p-4 ${
                    wordResults[wordResults.length - 1]?.correct
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                  data-testid="dictation-word-feedback"
                >
                  <div className="mb-2 flex items-center gap-2">
                    {wordResults[wordResults.length - 1]?.correct ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
                    )}
                    <span
                      className={`text-sm font-semibold ${
                        wordResults[wordResults.length - 1]?.correct
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {wordResults[wordResults.length - 1]?.correct ? '正确！' : '不正确'}
                    </span>
                  </div>

                  {!wordResults[wordResults.length - 1]?.correct && (
                    <div className="space-y-2">
                      <div data-testid="dictation-char-diff">
                        <p className="text-xs font-medium text-slate-600">逐字符对比：</p>
                        <div className="mt-1 flex flex-wrap gap-0.5 font-mono text-lg">
                          {charDiff(
                            wordResults[wordResults.length - 1]?.userInput ?? '',
                            wordResults[wordResults.length - 1]?.correctWord ?? ''
                          ).map((item, idx) => (
                            <span
                              key={idx}
                              className={`inline-block rounded px-0.5 ${
                                item.type === 'correct'
                                  ? 'text-emerald-700'
                                  : item.type === 'wrong'
                                    ? 'bg-red-200 text-red-700'
                                    : 'bg-amber-200 text-amber-700'
                              }`}
                            >
                              {item.char}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div data-testid="dictation-correct-answer">
                        <p className="text-xs font-medium text-slate-600">正确答案：</p>
                        <p className="text-base font-semibold text-slate-900">
                          {wordResults[wordResults.length - 1]?.correctWord}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-2" data-testid="dictation-example-sentence">
                    <p className="text-xs font-medium text-slate-600">例句：</p>
                    <p className="text-sm text-slate-700">
                      {wordResults[wordResults.length - 1]?.exampleSentence}
                    </p>
                  </div>

                  <div className="mt-2" data-testid="dictation-definition">
                    <p className="text-xs font-medium text-slate-600">释义：</p>
                    <p className="text-sm text-slate-700">{currentWord.definition}</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-primary w-full"
                  onClick={handleNext}
                  data-testid="dictation-next-btn"
                >
                  {currentIndex < words.length - 1 ? (
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
          <section
            className="card space-y-5 bg-white/95"
            data-testid="dictation-result"
          >
            <h2 className="section-title">
              <CheckCircle2 className="h-4 w-4 text-brand-600" aria-hidden="true" />
              本轮结果
            </h2>

            <div
              className="rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 p-6 text-center"
              data-testid="dictation-result-summary"
            >
              <p className="text-sm font-medium text-brand-600">准确率</p>
              <p className="mt-2 text-4xl font-bold text-brand-700" data-testid="dictation-accuracy">
                {accuracy}%
              </p>
              <p className="mt-2 text-sm text-slate-600" data-testid="dictation-correct-count">
                正确 {correctCount} / {wordResults.length}
              </p>
            </div>

            <div className="space-y-3" data-testid="dictation-result-list">
              {wordResults.map((result, idx) => (
                <div
                  key={result.wordEntryId}
                  className={`rounded-[var(--radius-control)] border p-3 ${
                    result.correct
                      ? 'border-emerald-200 bg-emerald-50/60'
                      : 'border-red-200 bg-red-50/60'
                  }`}
                  data-testid={`dictation-result-item-${idx}`}
                >
                  <div className="flex items-center gap-2">
                    {result.correct ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                    )}
                    <span className="font-semibold">{result.correctWord}</span>
                  </div>
                  {!result.correct && (
                    <div className="mt-1.5 space-y-1">
                      <p className="text-sm text-slate-600">
                        你的输入：
                        <span className="font-mono text-red-600">{result.userInput || '（空）'}</span>
                      </p>
                      <div className="flex flex-wrap gap-0.5 font-mono">
                        {charDiff(result.userInput, result.correctWord).map((item, i) => (
                          <span
                            key={i}
                            className={`inline-block rounded px-0.5 text-sm ${
                              item.type === 'correct'
                                ? 'text-emerald-700'
                                : item.type === 'wrong'
                                  ? 'bg-red-200 text-red-700'
                                  : 'bg-amber-200 text-amber-700'
                            }`}
                          >
                            {item.char}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-slate-500">例句：{result.exampleSentence}</p>
                </div>
              ))}
            </div>

            {submitMessage && (
              <div
                className={submitMessage.includes('离线') ? 'status-warning' : 'status-success'}
                data-testid="dictation-submit-msg"
              >
                {submitMessage.includes('离线') ? (
                  <CloudOff className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                )}
                {submitMessage}
              </div>
            )}

            {attemptResult && (
              <div className="status-success" data-testid="dictation-attempt-result">
                <CheckCircle2 className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                听写练习已记录 — 准确率 {attemptResult.accuracy}%
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleRestart}
              data-testid="dictation-restart-btn"
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
