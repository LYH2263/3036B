'use client';

import type { DailyWordDto, DailyWordHistoryDto, UserWordProgressDto } from '@lexigram/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, History, Lightbulb, Plus, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { SyncButton } from '../../components/sync-button';
import { apiRequest, ApiError } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import {
  isSpeechSynthesisSupported,
  speakWord
} from '../../lib/tts';

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays === 2) return '前天';

  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return weekdays[date.getDay()];
}

function getTimezoneOffsetMinutes(): number {
  if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) {
    return -new Date().getTimezoneOffset();
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'shortOffset'
  });
  const parts = formatter.formatToParts(now);
  const tzPart = parts.find((p) => p.type === 'timeZoneName');

  if (tzPart) {
    const match = tzPart.value.match(/GMT([+-]?)(\d+)(?::?(\d+))?/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const hours = parseInt(match[2], 10);
      const minutes = match[3] ? parseInt(match[3], 10) : 0;
      return sign * (hours * 60 + minutes);
    }
  }

  return -new Date().getTimezoneOffset();
}

export default function DailyWordPage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [timezoneOffset, setTimezoneOffset] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setSpeechSupported(isSpeechSynthesisSupported());
    setTimezoneOffset(getTimezoneOffsetMinutes());
  }, []);

  const todayQuery = useQuery({
    queryKey: ['daily-word-today', timezoneOffset],
    queryFn: () =>
      apiRequest<DailyWordDto>(
        `/daily-word/today?timezoneOffsetMinutes=${timezoneOffset ?? 0}`
      ),
    enabled: ready && timezoneOffset !== null
  });

  const historyQuery = useQuery({
    queryKey: ['daily-word-history'],
    queryFn: () => apiRequest<DailyWordHistoryDto>('/daily-word/history?days=7'),
    enabled: ready
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

  const markLearnedMutation = useMutation({
    mutationFn: () => apiRequest<DailyWordDto>('/daily-word/today/learned', { method: 'POST' }),
    onSuccess: () => {
      setNotice('已标记今日已学');
      void queryClient.invalidateQueries({ queryKey: ['daily-word-today'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-word-history'] });
    },
    onError: (error) => {
      setNotice(error instanceof ApiError ? error.message : '标记失败');
    }
  });

  const todayWord = todayQuery.data;
  const historyItems = historyQuery.data?.items ?? [];

  const handleSpeak = (word: string) => {
    const spoken = speakWord(word);
    if (!spoken) {
      setNotice('当前浏览器不支持语音播放');
    }
  };

  return (
    <AppShell title="每日一词">
      <div className="space-y-5" data-testid="daily-word-page">
        <SyncButton
          onSynced={() => {
            void queryClient.invalidateQueries({ queryKey: ['daily-word-today'] });
            void queryClient.invalidateQueries({ queryKey: ['daily-word-history'] });
          }}
        />

        {notice ? (
          <div className="status-success" data-testid="daily-word-notice">
            <CheckCircle2 className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
            {notice}
          </div>
        ) : null}

        <section className="card space-y-4 bg-gradient-to-br from-brand-50 to-white" data-testid="daily-word-card">
          <div className="flex items-center justify-between">
            <h2 className="section-title">
              <Lightbulb className="h-4 w-4 text-brand-600" aria-hidden="true" />
              今日单词
            </h2>
            {todayWord?.learned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                已学
              </span>
            ) : null}
          </div>

          {todayQuery.isLoading ? (
            <div className="status-neutral">加载中...</div>
          ) : null}

          {todayWord ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{todayWord.word.word}</h3>
                  <p className="mt-1 text-sm text-slate-500">{todayWord.word.phonetic || '暂无音标'}</p>
                </div>
                {speechSupported ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleSpeak(todayWord.word.word)}
                    data-testid="daily-word-pronounce"
                  >
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                    发音
                  </button>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-base text-slate-800">{todayWord.word.definition}</p>
              </div>

              <div className="rounded-lg bg-white/60 p-3">
                <p className="text-xs font-medium text-slate-500">例句</p>
                <p className="mt-1 text-sm text-slate-700 italic">{todayWord.word.exampleSentence}</p>
              </div>

              {todayWord.word.etymology ? (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-700">词源小知识</p>
                  <p className="mt-1 text-sm text-amber-800">{todayWord.word.etymology}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={() => addWordMutation.mutate(todayWord.word.id)}
                  disabled={addWordMutation.isPending}
                  data-testid="daily-word-add"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  加入生词本
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => markLearnedMutation.mutate()}
                  disabled={markLearnedMutation.isPending || todayWord.learned}
                  data-testid="daily-word-mark-learned"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {todayWord.learned ? '已学' : '今日已学'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card space-y-3 bg-white/95" data-testid="daily-word-history">
          <h2 className="section-title">
            <History className="h-4 w-4 text-brand-600" aria-hidden="true" />
            最近 7 天回顾
          </h2>

          {historyQuery.isLoading ? (
            <p className="text-sm text-slate-500">加载中...</p>
          ) : null}

          {!historyQuery.isLoading && historyItems.length === 0 ? (
            <p className="text-sm text-slate-500">暂无历史记录</p>
          ) : null}

          <div className="space-y-2">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3"
                data-testid={`history-item-${item.date}`}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-xs font-medium text-brand-700">
                    {formatDateLabel(item.date)}
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">{item.word.word}</p>
                    <p className="text-xs text-slate-500">{item.word.definition}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.learned ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="已学" />
                  ) : null}
                  {speechSupported ? (
                    <button
                      type="button"
                      className="btn-secondary h-8 px-2 py-1 text-xs"
                      onClick={() => handleSpeak(item.word.word)}
                      aria-label={`发音 ${item.word.word}`}
                    >
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
