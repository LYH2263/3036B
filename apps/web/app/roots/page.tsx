'use client';

import type {
  DerivedWordDto,
  UserWordProgressDto,
  WordRootDetailDto,
  WordRootDto,
  RootType
} from '@lexigram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Layers,
  Search,
  Volume2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { apiRequest, ApiError } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import {
  isSpeechSynthesisSupported,
  listSpeechVoices,
  speakWord,
  type SpeechVoiceOption
} from '../../lib/tts';

const ACCENT_OPTIONS = [
  { value: 'auto', label: '系统默认' },
  { value: 'en-US', label: '美式英语' },
  { value: 'en-GB', label: '英式英语' }
] as const;

const TYPE_FILTERS: { value: RootType | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'root', label: '词根' },
  { value: 'prefix', label: '前缀' },
  { value: 'suffix', label: '后缀' }
];

const AUTO_VOICE_VALUE = '__auto__';

export default function RootsPage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RootType | 'all'>('all');
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [accent, setAccent] = useState<(typeof ACCENT_OPTIONS)[number]['value']>('auto');
  const [voiceOptions, setVoiceOptions] = useState<SpeechVoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(AUTO_VOICE_VALUE);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const supported = isSpeechSynthesisSupported();
    setSpeechSupported(supported);

    if (!supported) {
      return;
    }

    const syncVoices = () => {
      setVoiceOptions(listSpeechVoices());
    };

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

  const rootsQuery = useQuery({
    queryKey: ['roots-list', query, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (typeFilter !== 'all') params.set('type', typeFilter);
      return apiRequest<WordRootDto[]>(`/roots${params.toString() ? `?${params.toString()}` : ''}`);
    },
    enabled: ready
  });

  const rootDetailQuery = useQuery({
    queryKey: ['root-detail', selectedRootId],
    queryFn: () => apiRequest<WordRootDetailDto>(`/roots/${selectedRootId}`),
    enabled: ready && !!selectedRootId
  });

  const addWordMutation = useMutation({
    mutationFn: (wordEntryId: string) =>
      apiRequest<UserWordProgressDto>('/user-words', {
        method: 'POST',
        body: JSON.stringify({ wordEntryId })
      }),
    onSuccess: () => {
      setNotice('已加入生词本');
      void queryClient.invalidateQueries({ queryKey: ['today-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
    },
    onError: (error) => {
      setNotice(error instanceof ApiError ? error.message : '加入失败');
    }
  });

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(''), 2500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const filteredVoiceOptions = useMemo(() => {
    if (accent === 'auto') {
      return voiceOptions;
    }

    const target = accent.toLowerCase();
    const prefix = target.split('-')[0];
    return voiceOptions.filter((voice) => {
      const lang = voice.lang.toLowerCase();
      return lang === target || lang.startsWith(`${prefix}-`);
    });
  }, [accent, voiceOptions]);

  const handleSpeak = (word: string) => {
    if (!speechSupported) {
      setNotice('当前浏览器不支持语音播放');
      return;
    }
    speakWord(word, {
      lang: accent === 'auto' ? undefined : accent,
      voiceURI: selectedVoiceURI === AUTO_VOICE_VALUE ? undefined : selectedVoiceURI
    });
  };

  const getTypeLabel = (type: RootType) => {
    switch (type) {
      case 'root':
        return '词根';
      case 'prefix':
        return '前缀';
      case 'suffix':
        return '后缀';
    }
  };

  const getTypeBadgeClass = (type: RootType) => {
    switch (type) {
      case 'root':
        return 'bg-brand-100 text-brand-700';
      case 'prefix':
        return 'bg-emerald-100 text-emerald-700';
      case 'suffix':
        return 'bg-amber-100 text-amber-700';
    }
  };

  const renderWordCard = (word: DerivedWordDto) => (
    <article
      key={word.id}
      className="card card-hover border-slate-200/90 p-4"
      data-testid={`derived-word-card-${word.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{word.word}</h3>
            {word.position && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {word.position === 'prefix' ? '前缀位置' : word.position === 'suffix' ? '后缀位置' : '词根位置'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{word.phonetic || '暂无音标'}</p>
          <p className="mt-2 text-sm text-slate-800">{word.definition}</p>
          {word.exampleSentence && (
            <p className="mt-1 text-xs text-slate-500">例句：{word.exampleSentence}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => handleSpeak(word.word)}
          disabled={!speechSupported}
          data-testid={`derived-word-pronounce-${word.id}`}
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          发音
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => addWordMutation.mutate(word.id)}
          disabled={addWordMutation.isPending}
          data-testid={`derived-word-add-${word.id}`}
        >
          加入生词本
        </button>
      </div>
    </article>
  );

  const NoticeIcon = notice.includes('失败') || notice.includes('错误')
    ? AlertCircle
    : CheckCircle2;
  const noticeTone =
    notice.includes('失败') || notice.includes('错误') ? 'status-error' : 'status-success';

  if (selectedRootId && rootDetailQuery.data) {
    const root = rootDetailQuery.data;
    return (
      <AppShell title="词根词缀">
        <div className="space-y-5" data-testid="roots-detail-page">
          {notice ? (
            <div className={noticeTone} data-testid="roots-notice">
              <NoticeIcon className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
              {notice}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSelectedRootId(null)}
              data-testid="roots-back-btn"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回列表
            </button>
          </div>

          <section className="card bg-white/95 p-5" data-testid="root-detail-header">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium ${getTypeBadgeClass(root.type)}`}
                  >
                    {getTypeLabel(root.type)}
                  </span>
                  <h2 className="text-2xl font-bold text-slate-900">{root.root}</h2>
                </div>
                <p className="mt-2 text-lg text-slate-700">{root.meaning}</p>
                {root.origin && (
                  <p className="mt-1 text-sm text-slate-500">来源：{root.origin}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">示例词</p>
                <p className="text-sm text-slate-700">{root.exampleWords}</p>
              </div>
            </div>
          </section>

          <section className="card bg-white/95" data-testid="derived-words-section">
            <h2 className="section-title">
              <Layers className="h-4 w-4 text-brand-600" aria-hidden="true" />
              衍生单词（{root.derivedWords.length}）
            </h2>
            {rootDetailQuery.isLoading ? (
              <p className="text-sm text-slate-500">加载中...</p>
            ) : root.derivedWords.length === 0 ? (
              <p className="text-sm text-slate-500" data-testid="derived-words-empty">
                该词根暂无衍生词
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="derived-words-list">
                {root.derivedWords.map(renderWordCard)}
              </div>
            )}
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="词根词缀">
      <div className="space-y-5" data-testid="roots-page">
        {notice ? (
          <div className={noticeTone} data-testid="roots-notice">
            <NoticeIcon className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
            {notice}
          </div>
        ) : null}

        <section className="card bg-white/95" data-testid="roots-search-section">
          <h2 className="section-title">
            <Search className="h-4 w-4 text-brand-600" aria-hidden="true" />
            搜索词根词缀
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="input-control"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入词根、含义或示例词搜索"
              data-testid="roots-search-input"
            />
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
              {TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`rounded-md px-2 py-1.5 text-sm font-medium transition ${
                    typeFilter === filter.value
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  onClick={() => setTypeFilter(filter.value)}
                  data-testid={`roots-filter-${filter.value}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="speech-controls">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600">发音口音</span>
              <select
                className="input-control"
                value={accent}
                onChange={(event) => setAccent(event.target.value as (typeof ACCENT_OPTIONS)[number]['value'])}
              >
                {ACCENT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600">发音人</span>
              <select
                className="input-control"
                value={selectedVoiceURI}
                onChange={(event) => setSelectedVoiceURI(event.target.value)}
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
          {!speechSupported ? (
            <p className="status-neutral mt-3">
              当前浏览器不支持语音播放，可更换到最新版 Chrome 或 Edge 体验发音。
            </p>
          ) : null}
        </section>

        <section className="card bg-white/95" data-testid="roots-list-section">
          <h2 className="section-title">
            <BookOpen className="h-4 w-4 text-brand-600" aria-hidden="true" />
            词根词缀列表（{rootsQuery.data?.length ?? 0}）
          </h2>

          {rootsQuery.isLoading ? (
            <p className="text-sm text-slate-500" data-testid="roots-loading">
              加载中...
            </p>
          ) : rootsQuery.data?.length === 0 ? (
            <p className="text-sm text-slate-500" data-testid="roots-empty">
              {query.trim() || typeFilter !== 'all' ? '没有找到匹配的词根词缀' : '暂无词根词缀数据'}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="roots-list">
              {rootsQuery.data?.map((root) => (
                <button
                  key={root.id}
                  type="button"
                  className="card card-hover border-slate-200/90 p-4 text-left"
                  onClick={() => setSelectedRootId(root.id)}
                  data-testid={`root-card-${root.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${getTypeBadgeClass(root.type)}`}
                        >
                          {getTypeLabel(root.type)}
                        </span>
                        <h3 className="text-lg font-semibold">{root.root}</h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{root.meaning}</p>
                      {root.origin && (
                        <p className="mt-1 text-xs text-slate-500">来源：{root.origin}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-slate-500">衍生词</p>
                      <p className="text-lg font-semibold text-brand-600">{root.derivedWordsCount}</p>
                    </div>
                  </div>
                  {root.exampleWords && (
                    <p className="mt-2 text-xs text-slate-500 truncate">示例：{root.exampleWords}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
