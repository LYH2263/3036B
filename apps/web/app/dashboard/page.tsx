'use client';

import type { DailyWordDto } from '@lexigram/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Clock3, FileText, Flame, Lightbulb, Sparkles, Volume2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { SyncButton } from '../../components/sync-button';
import { apiRequest } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { isSpeechSynthesisSupported, speakWord } from '../../lib/tts';

interface StatsOverview {
  todayReviewCount: number;
  todayNewWords: number;
  vocabularyTotal: number;
  totalReviews: number;
  grammarAttempts: number;
  grammarCorrectRate: number;
  streakDays: number;
  achievements: Array<{ code: string; title: string; description: string }>;
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

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { ready } = useRequireAuth();
  const [timezoneOffset, setTimezoneOffset] = useState<number | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setTimezoneOffset(getTimezoneOffsetMinutes());
    setSpeechSupported(isSpeechSynthesisSupported());
  }, []);

  const statsQuery = useQuery({
    queryKey: ['stats-overview'],
    queryFn: () => apiRequest<StatsOverview>('/stats/overview'),
    enabled: ready
  });

  const dailyWordQuery = useQuery({
    queryKey: ['daily-word-today', timezoneOffset],
    queryFn: () =>
      apiRequest<DailyWordDto>(
        `/daily-word/today?timezoneOffsetMinutes=${timezoneOffset ?? 0}`
      ),
    enabled: ready && timezoneOffset !== null
  });

  const stats = statsQuery.data;
  const dailyWord = dailyWordQuery.data;

  const handleSpeak = (word: string) => {
    speakWord(word);
  };

  return (
    <AppShell title="学习面板">
      <div className="space-y-5" data-testid="dashboard-page">
        <SyncButton
          onSynced={() => {
            void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
            void queryClient.invalidateQueries({ queryKey: ['daily-word-today'] });
          }}
        />

        {statsQuery.isLoading ? (
          <div className="status-neutral" data-testid="dashboard-loading">
            加载中...
          </div>
        ) : null}

        {stats ? (
          <>
            {dailyWord ? (
              <Link
                href="/daily"
                className="card card-hover group block bg-gradient-to-br from-brand-50 to-white"
                data-testid="dashboard-daily-word-card"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="section-title text-sm">
                      <Lightbulb className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      今日一词
                    </p>
                    <h3 className="mt-2 text-xl font-bold text-slate-900">{dailyWord.word.word}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">{dailyWord.word.phonetic || '暂无音标'}</p>
                    <p className="mt-2 text-sm text-slate-700">{dailyWord.word.definition}</p>
                  </div>
                  {speechSupported ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        handleSpeak(dailyWord.word.word);
                      }}
                      data-testid="dashboard-daily-word-pronounce"
                    >
                      <Volume2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {dailyWord.learned ? '已学习今日单词' : '点击查看详情并学习'}
                  </span>
                  <span className="inline-flex items-center text-xs font-medium text-brand-700">
                    进入
                    <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="dashboard-stats">
              <div className="card card-hover bg-white/95" data-testid="dashboard-card-today-review">
                <p className="stat-label">
                  <Clock3 className="h-4 w-4 text-brand-500" aria-hidden="true" />
                  今日待复习
                </p>
                <p className="stat-value">{stats.todayReviewCount}</p>
              </div>
              <div className="card card-hover bg-white/95" data-testid="dashboard-card-today-new-words">
                <p className="stat-label">
                  <Sparkles className="h-4 w-4 text-brand-500" aria-hidden="true" />
                  今日新增词汇
                </p>
                <p className="stat-value">{stats.todayNewWords}</p>
              </div>
              <div className="card card-hover bg-white/95" data-testid="dashboard-card-grammar-attempts">
                <p className="stat-label">
                  <FileText className="h-4 w-4 text-brand-500" aria-hidden="true" />
                  语法练习次数
                </p>
                <p className="stat-value">{stats.grammarAttempts}</p>
              </div>
              <div className="card card-hover bg-white/95" data-testid="dashboard-card-streak-days">
                <p className="stat-label">
                  <Flame className="h-4 w-4 text-brand-500" aria-hidden="true" />
                  连续学习天数
                </p>
                <p className="stat-value">{stats.streakDays}</p>
              </div>
            </section>

            {stats.vocabularyTotal === 0 && stats.grammarAttempts === 0 ? (
              <div className="status-neutral" data-testid="dashboard-empty-state">
                当前还没有学习记录，去查询并加入第一个单词吧。
              </div>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-3" data-testid="dashboard-shortcuts">
              <Link
                href="/vocabulary"
                className="card card-hover group border-slate-200/90 bg-white/95"
                data-testid="dashboard-go-vocabulary"
              >
                <p className="section-title text-sm">
                  <BookOpen className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  开始词汇学习
                </p>
                <p className="mt-1 text-sm text-slate-500">搜索词条、加入生词本并完成复习。</p>
                <span className="mt-3 inline-flex items-center text-xs font-medium text-brand-700">
                  进入
                  <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
              <Link
                href="/grammar"
                className="card card-hover group border-slate-200/90 bg-white/95"
                data-testid="dashboard-go-grammar"
              >
                <p className="section-title text-sm">
                  <FileText className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  继续语法练习
                </p>
                <p className="mt-1 text-sm text-slate-500">按级别选择知识点并提交练习。</p>
                <span className="mt-3 inline-flex items-center text-xs font-medium text-brand-700">
                  进入
                  <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
              <Link
                href="/progress"
                className="card card-hover group border-slate-200/90 bg-white/95"
                data-testid="dashboard-go-progress"
              >
                <p className="section-title text-sm">
                  <Flame className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  查看学习进度
                </p>
                <p className="mt-1 text-sm text-slate-500">查看统计与已解锁成就。</p>
                <span className="mt-3 inline-flex items-center text-xs font-medium text-brand-700">
                  进入
                  <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
