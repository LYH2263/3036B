'use client';

import type { SpeakingWordDto, SpeakingAttemptResultDto, SpeakingBestScoreDto, SpeakingWordResult } from '@lexigram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  CloudOff,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  Volume2,
  XCircle,
  AlertTriangle,
  Trophy
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
  { value: 'en-CA', label: '加式英语（en-CA）' },
  { value: 'en-IN', label: '印式英语（en-IN）' }
] as const;

const SOURCE_OPTIONS = [
  { value: 'mixed', label: '混合（生词本 + 词库）' },
  { value: 'user-words', label: '仅生词本' },
  { value: 'word-bank', label: '仅词库' }
] as const;

const MODE_OPTIONS = [
  { value: 'word', label: '单词模式' },
  { value: 'sentence', label: '例句模式' }
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
type RecognitionStatus = 'idle' | 'requesting' | 'recording' | 'processing' | 'error';

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function wordSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase();
  const normB = b.toLowerCase();

  if (normA === normB) return 1;
  if (!normA || !normB) return 0;

  const maxLen = Math.max(normA.length, normB.length);
  const distance = levenshteinDistance(normA, normB);
  return Math.max(0, 1 - distance / maxLen);
}

function alignWords(
  targetWords: string[],
  recognizedWords: string[]
): SpeakingWordResult[] {
  const results: SpeakingWordResult[] = [];
  const similarityThreshold = 0.6;

  let i = 0;
  let j = 0;

  while (i < targetWords.length || j < recognizedWords.length) {
    if (i >= targetWords.length) {
      results.push({
        word: '',
        recognized: recognizedWords[j],
        matchType: 'extra',
        similarity: 0
      });
      j++;
      continue;
    }

    if (j >= recognizedWords.length) {
      results.push({
        word: targetWords[i],
        recognized: '',
        matchType: 'missing',
        similarity: 0
      });
      i++;
      continue;
    }

    const targetWord = targetWords[i];
    const recognizedWord = recognizedWords[j];
    const similarity = wordSimilarity(targetWord, recognizedWord);

    if (similarity >= similarityThreshold) {
      results.push({
        word: targetWord,
        recognized: recognizedWord,
        matchType: similarity >= 0.9 ? 'correct' : 'wrong',
        similarity
      });
      i++;
      j++;
    } else if (i + 1 < targetWords.length) {
      const nextSimilarity = wordSimilarity(targetWords[i + 1], recognizedWord);
      if (nextSimilarity >= similarityThreshold) {
        results.push({
          word: targetWord,
          recognized: '',
          matchType: 'missing',
          similarity: 0
        });
        i++;
      } else if (j + 1 < recognizedWords.length) {
        const skipRecognizedSimilarity = wordSimilarity(targetWord, recognizedWords[j + 1]);
        if (skipRecognizedSimilarity >= similarityThreshold) {
          results.push({
            word: '',
            recognized: recognizedWord,
            matchType: 'extra',
            similarity: 0
          });
          j++;
        } else {
          results.push({
            word: targetWord,
            recognized: recognizedWord,
            matchType: 'wrong',
            similarity
          });
          i++;
          j++;
        }
      } else {
        results.push({
          word: targetWord,
          recognized: recognizedWord,
          matchType: 'wrong',
          similarity
        });
        i++;
        j++;
      }
    } else {
      results.push({
        word: targetWord,
        recognized: recognizedWord,
        matchType: 'wrong',
        similarity
      });
      i++;
      j++;
    }
  }

  return results;
}

function calculateOverallScore(wordResults: SpeakingWordResult[]): number {
  if (wordResults.length === 0) return 0;

  const correctCount = wordResults.filter((r) => r.matchType === 'correct').length;
  const partialCorrectCount = wordResults.filter((r) => r.matchType === 'wrong').length;
  const partialScore = wordResults
    .filter((r) => r.matchType === 'wrong')
    .reduce((sum, r) => sum + r.similarity, 0);

  const totalScore = correctCount + partialScore;
  const maxScore = wordResults.length;

  return Math.round((totalScore / maxScore) * 100);
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function createSpeechRecognition(): SpeechRecognition | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export default function SpeakingPage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('setup');
  const [source, setSource] = useState<(typeof SOURCE_OPTIONS)[number]['value']>('mixed');
  const [mode, setMode] = useState<(typeof MODE_OPTIONS)[number]['value']>('word');
  const [count, setCount] = useState<number>(10);
  const [accent, setAccent] = useState<(typeof ACCENT_OPTIONS)[number]['value']>('auto');
  const [rate, setRate] = useState<number>(0.95);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(AUTO_VOICE_VALUE);
  const [voiceOptions, setVoiceOptions] = useState<SpeechVoiceOption[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);

  const [items, setItems] = useState<SpeakingWordDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus>('idle');
  const [recognitionError, setRecognitionError] = useState('');
  const [wordResults, setWordResults] = useState<SpeakingWordResult[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [attemptResult, setAttemptResult] = useState<SpeakingAttemptResultDto | null>(null);
  const [bestScore, setBestScore] = useState<SpeakingBestScoreDto | null>(null);
  const [sessionScores, setSessionScores] = useState<number[]>([]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionActiveRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ttsSupported = isSpeechSynthesisSupported();
    setSpeechSupported(ttsSupported);
    setRecognitionSupported(isSpeechRecognitionSupported());

    if (!ttsSupported) return;

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

  const itemsQuery = useQuery({
    queryKey: ['speaking-items', source, count, mode],
    queryFn: () =>
      apiRequest<SpeakingWordDto[]>(
        `/speaking/items?count=${count}&source=${encodeURIComponent(source)}&mode=${encodeURIComponent(mode)}`
      ),
    enabled: false
  });

  const bestScoreQuery = useQuery({
    queryKey: ['speaking-best-score', mode],
    queryFn: () =>
      apiRequest<SpeakingBestScoreDto>(`/speaking/best-score?mode=${encodeURIComponent(mode)}`),
    enabled: phase === 'playing' || phase === 'result'
  });

  useEffect(() => {
    if (bestScoreQuery.data) {
      setBestScore(bestScoreQuery.data);
    }
  }, [bestScoreQuery.data]);

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      wordEntryId?: string;
      targetText: string;
      recognizedText: string;
      similarityScore: number;
      wordResults: SpeakingWordResult[];
      totalWords: number;
      correctCount: number;
      practiceMode: 'word' | 'sentence';
    }) => {
      const clientEventId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

      const requestPayload = { ...payload, clientEventId };
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (!online) {
        await enqueueOfflineEvent({
          type: 'SPEAKING_ATTEMPT',
          clientEventId,
          payload,
          createdAt: new Date().toISOString()
        });
        return { queued: true };
      }

      try {
        const response = await apiRequest<SpeakingAttemptResultDto>('/speaking/attempts', {
          method: 'POST',
          body: JSON.stringify(requestPayload)
        });
        return { queued: false, response };
      } catch (_error) {
        await enqueueOfflineEvent({
          type: 'SPEAKING_ATTEMPT',
          clientEventId,
          payload,
          createdAt: new Date().toISOString()
        });
        return { queued: true };
      }
    },
    onSuccess: (payload) => {
      if (payload.queued) {
        setSubmitMessage('当前离线，跟读结果已加入待同步队列');
        setAttemptResult(null);
      } else {
        setAttemptResult(payload.response ?? null);
        setSubmitMessage('提交成功');
      }
      void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['speaking-best-score'] });
    }
  });

  const handleStart = useCallback(() => {
    itemsQuery.refetch().then((result) => {
      if (result.data && result.data.length > 0) {
        setItems(result.data);
        setCurrentIndex(0);
        setRecognizedText('');
        setInterimText('');
        setWordResults([]);
        setShowFeedback(false);
        setAttemptResult(null);
        setSubmitMessage('');
        setSessionScores([]);
        setRecognitionStatus('idle');
        setRecognitionError('');
        setPhase('playing');
        setTimeout(() => {
          const currentItem = result.data![0];
          speakWord(currentItem.text, {
            lang: accent === 'auto' ? undefined : accent,
            voiceURI: selectedVoiceURI === AUTO_VOICE_VALUE ? undefined : selectedVoiceURI,
            rate
          });
        }, 300);
      }
    });
  }, [itemsQuery, accent, selectedVoiceURI, rate]);

  const currentItem = items[currentIndex] ?? null;

  const handlePlay = useCallback(() => {
    if (!currentItem) return;
    speakWord(currentItem.text, {
      lang: accent === 'auto' ? undefined : accent,
      voiceURI: selectedVoiceURI === AUTO_VOICE_VALUE ? undefined : selectedVoiceURI,
      rate
    });
  }, [currentItem, accent, selectedVoiceURI, rate]);

  const startRecognition = useCallback(() => {
    if (!recognitionSupported) {
      setRecognitionError('当前浏览器不支持语音识别功能，请使用最新版 Chrome 或 Edge 浏览器');
      setRecognitionStatus('error');
      return;
    }

    try {
      if (!recognitionRef.current) {
        recognitionRef.current = createSpeechRecognition();
        if (!recognitionRef.current) {
          setRecognitionError('无法初始化语音识别');
          setRecognitionStatus('error');
          return;
        }
      }

      const recognition = recognitionRef.current;
      recognition.lang = accent === 'auto' ? 'en-US' : accent;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      setRecognitionStatus('requesting');
      setRecognizedText('');
      setInterimText('');
      setRecognitionError('');

      recognition.onstart = () => {
        recognitionActiveRef.current = true;
        setRecognitionStatus('recording');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setRecognizedText(finalTranscript.trim());
        }
        if (interimTranscript) {
          setInterimText(interimTranscript.trim());
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        recognitionActiveRef.current = false;
        setRecognitionStatus('error');

        if (event.error === 'not-allowed') {
          setRecognitionError('麦克风权限被拒绝，请在浏览器设置中允许访问麦克风');
        } else if (event.error === 'service-not-allowed') {
          setRecognitionError('语音识别服务不可用，请检查网络连接');
        } else if (event.error === 'network') {
          setRecognitionError('网络连接中断，语音识别需要网络连接');
        } else if (event.error === 'no-speech') {
          setRecognitionError('没有检测到语音，请确保麦克风正常工作并大声朗读');
        } else if (event.error === 'audio-capture') {
          setRecognitionError('无法捕获音频，请检查麦克风是否连接正常');
        } else {
          setRecognitionError(`语音识别出错：${event.message || event.error}`);
        }
      };

      recognition.onend = () => {
        if (recognitionActiveRef.current) {
          recognitionActiveRef.current = false;
          setRecognitionStatus('processing');

          setTimeout(() => {
            setRecognitionStatus('idle');
          }, 500);
        }
      };

      recognition.start();
    } catch (error) {
      setRecognitionStatus('error');
      setRecognitionError(`启动语音识别失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [recognitionSupported, accent]);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current && recognitionActiveRef.current) {
      recognitionActiveRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch (_error) {
        // Ignore stop errors
      }
      setRecognitionStatus('processing');

      setTimeout(() => {
        setRecognitionStatus('idle');
      }, 500);
    }
  }, []);

  const handleSubmitRecording = useCallback(() => {
    if (!currentItem) return;

    const finalText = recognizedText.trim();

    if (!finalText) {
      setRecognitionError('没有识别到语音内容，请重试');
      setRecognitionStatus('error');
      return;
    }

    const targetWords = tokenize(currentItem.text);
    const recognizedWords = tokenize(finalText);

    if (targetWords.length === 0) {
      setRecognitionError('目标文本无效');
      setRecognitionStatus('error');
      return;
    }

    const results = alignWords(targetWords, recognizedWords);
    const score = calculateOverallScore(results);
    const correctCount = results.filter((r) => r.matchType === 'correct').length;

    setWordResults(results);
    setShowFeedback(true);
    setSessionScores((prev) => [...prev, score]);

    const payload = {
      wordEntryId: currentItem.wordEntryId,
      targetText: currentItem.text,
      recognizedText: finalText,
      similarityScore: score,
      wordResults: results,
      totalWords: targetWords.length,
      correctCount,
      practiceMode: mode as 'word' | 'sentence'
    };

    submitMutation.mutate(payload);
  }, [currentItem, recognizedText, mode, submitMutation]);

  const handleNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setRecognizedText('');
      setInterimText('');
      setShowFeedback(false);
      setRecognitionStatus('idle');
      setRecognitionError('');
      setTimeout(() => {
        const nextItem = items[nextIndex];
        speakWord(nextItem.text, {
          lang: accent === 'auto' ? undefined : accent,
          voiceURI: selectedVoiceURI === AUTO_VOICE_VALUE ? undefined : selectedVoiceURI,
          rate
        });
      }, 300);
    } else {
      setPhase('result');
    }
  }, [currentIndex, items, accent, selectedVoiceURI, rate]);

  const handleRetry = useCallback(() => {
    setRecognizedText('');
    setInterimText('');
    setShowFeedback(false);
    setRecognitionStatus('idle');
    setRecognitionError('');
    setWordResults([]);
    handlePlay();
  }, [handlePlay]);

  const handleRestart = useCallback(() => {
    setPhase('setup');
    setItems([]);
    setCurrentIndex(0);
    setRecognizedText('');
    setInterimText('');
    setWordResults([]);
    setShowFeedback(false);
    setAttemptResult(null);
    setSubmitMessage('');
    setRecognitionStatus('idle');
    setRecognitionError('');
    setSessionScores([]);
  }, []);

  const averageScore =
    sessionScores.length > 0
      ? Math.round(sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length)
      : 0;

  const currentScore = sessionScores.length > 0 ? sessionScores[sessionScores.length - 1] : 0;

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_error) {
          // Ignore
        }
      }
    };
  }, []);

  const getWordResultColor = (matchType: SpeakingWordResult['matchType']) => {
    switch (matchType) {
      case 'correct':
        return 'text-emerald-700';
      case 'wrong':
        return 'bg-red-200 text-red-700';
      case 'missing':
        return 'bg-amber-200 text-amber-700';
      case 'extra':
        return 'bg-purple-200 text-purple-700';
    }
  };

  const getWordResultLabel = (matchType: SpeakingWordResult['matchType']) => {
    switch (matchType) {
      case 'correct':
        return '正确';
      case 'wrong':
        return '发音不准';
      case 'missing':
        return '漏读';
      case 'extra':
        return '多读';
    }
  };

  if (!ready) return null;

  return (
    <AppShell title="口语跟读">
      <div className="space-y-5" data-testid="speaking-page">
        <SyncButton
          onSynced={() => {
            void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
          }}
        />

        {phase === 'setup' && (
          <section className="card space-y-5 bg-white/95" data-testid="speaking-setup">
            <h2 className="section-title">
              <Mic className="h-4 w-4 text-brand-600" aria-hidden="true" />
              跟读设置
            </h2>

            {!speechSupported && (
              <div className="status-warning" data-testid="speaking-tts-warning">
                当前浏览器不支持语音播放功能，请使用最新版 Chrome 或 Edge 浏览器。
              </div>
            )}

            {!recognitionSupported && (
              <div className="status-warning" data-testid="speaking-recognition-warning">
                <AlertTriangle className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                当前浏览器不支持语音识别功能。语音识别需要 Chrome 或 Edge 浏览器，且需要网络连接。
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">练习模式</span>
                <select
                  className="input-control"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as (typeof MODE_OPTIONS)[number]['value'])}
                  data-testid="speaking-mode-select"
                >
                  {MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">单词来源</span>
                <select
                  className="input-control"
                  value={source}
                  onChange={(e) =>
                    setSource(e.target.value as (typeof SOURCE_OPTIONS)[number]['value'])
                  }
                  data-testid="speaking-source-select"
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
                  data-testid="speaking-count-select"
                >
                  {COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} 个{mode === 'word' ? '单词' : '句子'}
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
                  data-testid="speaking-accent-select"
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
                  data-testid="speaking-rate-select"
                >
                  {RATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">发音人</span>
                <select
                  className="input-control"
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  data-testid="speaking-voice-select"
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

            {bestScoreQuery.data && bestScoreQuery.data.totalAttempts > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      历史最高：{bestScoreQuery.data.bestScore}%
                    </p>
                    <p className="text-xs text-amber-600">
                      累计练习 {bestScoreQuery.data.totalAttempts} 次，平均 {bestScoreQuery.data.averageScore}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleStart}
              disabled={itemsQuery.isFetching || !recognitionSupported}
              data-testid="speaking-start-btn"
            >
              {itemsQuery.isFetching ? '加载中...' : '开始跟读'}
            </button>
          </section>
        )}

        {phase === 'playing' && currentItem && (
          <section className="card space-y-5 bg-white/95" data-testid="speaking-playing">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600" data-testid="speaking-progress">
                第 {currentIndex + 1} / {items.length} 题
              </p>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200" data-testid="speaking-progress-bar-container">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
                  data-testid="speaking-progress-bar"
                />
              </div>
            </div>

            <div
              className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-slate-200 bg-slate-50/60 p-6"
              data-testid="speaking-target-area"
            >
              <button
                type="button"
                className="btn-secondary h-14 w-14 rounded-full"
                onClick={handlePlay}
                data-testid="speaking-play-btn"
                aria-label="播放发音"
              >
                <Volume2 className="h-6 w-6" aria-hidden="true" />
              </button>
              <p className="text-center text-base font-medium text-slate-700" data-testid="speaking-target-text">
                {currentItem.text}
              </p>
              {currentItem.phonetic && (
                <p className="text-sm text-slate-500" data-testid="speaking-phonetic">
                  /{currentItem.phonetic}/
                </p>
              )}
              <p className="text-xs text-slate-500">{currentItem.definition}</p>
            </div>

            {!showFeedback ? (
              <div className="space-y-4" data-testid="speaking-recording-area">
                {recognitionStatus === 'recording' && (
                  <div className="flex items-center justify-center gap-2 rounded-lg bg-red-50 p-3" data-testid="speaking-recording-indicator">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
                    </span>
                    <span className="text-sm font-medium text-red-700">正在录音...</span>
                  </div>
                )}

                {recognitionStatus === 'requesting' && (
                  <div className="flex items-center justify-center gap-2 rounded-lg bg-blue-50 p-3">
                    <span className="text-sm text-blue-700">正在请求麦克风权限...</span>
                  </div>
                )}

                {recognitionStatus === 'processing' && (
                  <div className="flex items-center justify-center gap-2 rounded-lg bg-blue-50 p-3">
                    <span className="text-sm text-blue-700">正在处理语音...</span>
                  </div>
                )}

                {recognitionError && (
                  <div className="status-warning" data-testid="speaking-error">
                    <AlertTriangle className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                    {recognitionError}
                  </div>
                )}

                {(interimText || recognizedText) && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="speaking-recognized-text">
                    <p className="text-xs font-medium text-slate-600">识别结果：</p>
                    <p className="mt-1 text-base text-slate-800">
                      {recognizedText}
                      {interimText && (
                        <span className="text-slate-400">{interimText}</span>
                      )}
                    </p>
                  </div>
                )}

                <div className="flex flex-col items-center gap-3">
                  {recognitionStatus !== 'recording' ? (
                    <button
                      type="button"
                      className="btn-primary h-20 w-20 rounded-full p-0"
                      onClick={startRecognition}
                      disabled={recognitionStatus === 'requesting' || recognitionStatus === 'processing'}
                      data-testid="speaking-record-btn"
                      aria-label="开始录音"
                    >
                      <Mic className="h-8 w-8" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary h-20 w-20 rounded-full border-2 border-red-400 bg-red-100 p-0 hover:bg-red-200"
                      onClick={stopRecognition}
                      data-testid="speaking-stop-btn"
                      aria-label="停止录音"
                    >
                      <MicOff className="h-8 w-8 text-red-600" aria-hidden="true" />
                    </button>
                  )}

                  <p className="text-xs text-slate-500">
                    {recognitionStatus === 'recording'
                      ? '点击停止按钮结束录音'
                      : '点击麦克风按钮开始录音，朗读上方文本'}
                  </p>
                </div>

                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handlePlay}
                    data-testid="speaking-replay-btn"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    重新播放
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSubmitRecording}
                    disabled={!recognizedText.trim() || recognitionStatus === 'recording' || recognitionStatus === 'processing'}
                    data-testid="speaking-submit-btn"
                  >
                    提交评分
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4" data-testid="speaking-feedback-area">
                <div
                  className={`rounded-[var(--radius-control)] border p-4 ${
                    currentScore >= 80
                      ? 'border-emerald-200 bg-emerald-50'
                      : currentScore >= 60
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-red-200 bg-red-50'
                  }`}
                  data-testid="speaking-score-feedback"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {currentScore >= 80 ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
                      )}
                      <span
                        className={`text-sm font-semibold ${
                          currentScore >= 80
                            ? 'text-emerald-700'
                            : currentScore >= 60
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }`}
                      >
                        {currentScore >= 80 ? '很棒！' : currentScore >= 60 ? '继续加油！' : '再试一次！'}
                      </span>
                    </div>
                    <span
                      className={`text-2xl font-bold ${
                        currentScore >= 80
                          ? 'text-emerald-700'
                          : currentScore >= 60
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {currentScore}%
                    </span>
                  </div>

                  <div className="mb-3">
                    <p className="text-xs font-medium text-slate-600 mb-1">逐词对比：</p>
                    <div className="flex flex-wrap gap-1.5" data-testid="speaking-word-results">
                      {wordResults.map((result, idx) => (
                        <span key={idx} className="group relative inline-block">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-sm ${getWordResultColor(result.matchType)}`}
                          >
                            {result.word || result.recognized}
                          </span>
                          <div className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 transform rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">
                            {getWordResultLabel(result.matchType)}
                            {result.matchType === 'wrong' && ` (${(result.similarity * 100).toFixed(0)}%)`}
                          </div>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> 正确
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded bg-red-200" /> 发音不准
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded bg-amber-200" /> 漏读
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded bg-purple-200" /> 多读
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-600">你的发音：</p>
                  <p className="mt-1 text-base text-slate-800" data-testid="speaking-user-text">
                    {recognizedText}
                  </p>
                </div>

                {bestScore && currentScore > bestScore.bestScore && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      <span className="text-sm font-semibold text-amber-700">🎉 新纪录！</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn-secondary flex-1"
                    onClick={handleRetry}
                    data-testid="speaking-retry-btn"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    重试
                  </button>
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={handleNext}
                    data-testid="speaking-next-btn"
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
              </div>
            )}
          </section>
        )}

        {phase === 'result' && (
          <section className="card space-y-5 bg-white/95" data-testid="speaking-result">
            <h2 className="section-title">
              <CheckCircle2 className="h-4 w-4 text-brand-600" aria-hidden="true" />
              本轮结果
            </h2>

            <div
              className="rounded-[var(--radius-card)] border border-brand-200 bg-brand-50 p-6 text-center"
              data-testid="speaking-result-summary"
            >
              <p className="text-sm font-medium text-brand-600">平均得分</p>
              <p className="mt-2 text-4xl font-bold text-brand-700" data-testid="speaking-average-score">
                {averageScore}%
              </p>
              <p className="mt-2 text-sm text-slate-600" data-testid="speaking-total-count">
                完成 {sessionScores.length} / {items.length}
              </p>
            </div>

            {bestScore && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-3">
                  <Trophy className="h-6 w-6 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      历史最高：{bestScore.bestScore}%
                    </p>
                    <p className="text-xs text-amber-600">
                      累计练习 {bestScore.totalAttempts} 次，平均 {bestScore.averageScore}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3" data-testid="speaking-result-list">
              {sessionScores.map((score, idx) => (
                <div
                  key={idx}
                  className={`rounded-[var(--radius-control)] border p-3 ${
                    score >= 80
                      ? 'border-emerald-200 bg-emerald-50/60'
                      : score >= 60
                        ? 'border-amber-200 bg-amber-50/60'
                        : 'border-red-200 bg-red-50/60'
                  }`}
                  data-testid={`speaking-result-item-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {score >= 80 ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      ) : score >= 60 ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                      )}
                      <span className="font-medium text-slate-700">{items[idx]?.text}</span>
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        score >= 80
                          ? 'text-emerald-700'
                          : score >= 60
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {submitMessage && (
              <div
                className={submitMessage.includes('离线') ? 'status-warning' : 'status-success'}
                data-testid="speaking-submit-msg"
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
              data-testid="speaking-restart-btn"
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
