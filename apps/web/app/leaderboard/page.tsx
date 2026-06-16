'use client';

import type {
  LeaderboardDimension,
  LeaderboardDto,
  LeaderboardEntryDto,
  LeaderboardPeriod
} from '@lexigram/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  Flame,
  Medal,
  Percent,
  RefreshCw,
  Trophy,
  User
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { apiRequest } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { formatPercent } from '../../lib/helpers';

interface DimensionOption {
  key: LeaderboardDimension;
  label: string;
  description: string;
  icon: typeof Trophy;
  valueLabel: (v: number) => string;
  weekAvailable: boolean;
}

const DIMENSIONS: DimensionOption[] = [
  {
    key: 'weekly_reviews',
    label: '本周复习量',
    description: '本周完成的词汇复习次数',
    icon: RefreshCw,
    valueLabel: (v) => `${v} 次`,
    weekAvailable: false
  },
  {
    key: 'streak_days',
    label: '连续学习天数',
    description: '连续每天至少有一项学习记录',
    icon: Flame,
    valueLabel: (v) => `${v} 天`,
    weekAvailable: false
  },
  {
    key: 'grammar_accuracy',
    label: '语法正确率',
    description: '语法练习答对题目占比（需答满5题）',
    icon: Percent,
    valueLabel: (v) => formatPercent(v),
    weekAvailable: true
  },
  {
    key: 'vocabulary_count',
    label: '累计词汇量',
    description: '加入生词本的单词总数',
    icon: BookOpen,
    valueLabel: (v) => `${v} 词`,
    weekAvailable: true
  }
];

const PERIODS: Array<{ key: LeaderboardPeriod; label: string }> = [
  { key: 'week', label: '本周' },
  { key: 'all', label: '总榜' }
];

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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 text-sm font-bold text-white shadow-sm ring-2 ring-yellow-200">
        <Trophy className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-sm font-bold text-white shadow-sm ring-2 ring-slate-200">
        <Medal className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-500 text-sm font-bold text-white shadow-sm ring-2 ring-orange-200">
        <Award className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
      {rank}
    </span>
  );
}

function Avatar({
  color,
  name
}: {
  color: string | null;
  name: string;
}) {
  const bg = color ?? '#6366f1';
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
      style={{ backgroundColor: bg }}
    >
      {initial}
    </span>
  );
}

function LeaderboardItem({
  entry,
  dimension
}: {
  entry: LeaderboardEntryDto;
  dimension: DimensionOption;
}) {
  const isCurrentUser = entry.isCurrentUser;

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all sm:px-4 ${
        isCurrentUser
          ? 'border-brand-300 bg-brand-50/80 ring-2 ring-brand-200 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
      }`}
      data-testid={`leaderboard-item-${entry.rank}${isCurrentUser ? '-me' : ''}`}
    >
      <RankBadge rank={entry.rank} />
      <Avatar color={entry.avatarColor} name={entry.displayName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm font-medium ${
              isCurrentUser ? 'text-brand-700 font-semibold' : 'text-slate-800'
            }`}
          >
            {entry.displayName}
            {isCurrentUser ? (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                我
              </span>
            ) : null}
            {entry.isTied ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                并列
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-base font-bold tabular-nums ${
            isCurrentUser ? 'text-brand-700' : 'text-slate-900'
          }`}
        >
          {dimension.valueLabel(entry.value)}
        </p>
      </div>
    </li>
  );
}

function CurrentUserCard({
  entry,
  dimension,
  visibleInList
}: {
  entry: LeaderboardEntryDto;
  dimension: DimensionOption;
  visibleInList: boolean;
}) {
  return (
    <section
      className="card border-brand-300 bg-gradient-to-br from-brand-50 to-white shadow-sm"
      data-testid="leaderboard-my-rank"
    >
      <div className="mb-2 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-brand-600" aria-hidden="true" />
        <h2 className="section-title mb-0">我的排名</h2>
        {visibleInList ? (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            已在上方榜单中
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-3 ring-1 ring-brand-200/60 sm:px-4">
        <RankBadge rank={entry.rank} />
        <Avatar color={entry.avatarColor} name={entry.displayName} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-brand-700 truncate">
            {entry.displayName}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            共 {dimension.label}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-brand-700 tabular-nums">
            {dimension.valueLabel(entry.value)}
          </p>
          {entry.isTied ? (
            <p className="text-xs text-slate-500 mt-0.5">并列名次</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function LeaderboardPage() {
  const { ready } = useRequireAuth();
  const [dimensionKey, setDimensionKey] =
    useState<LeaderboardDimension>('weekly_reviews');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [timezoneOffset, setTimezoneOffset] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setTimezoneOffset(getTimezoneOffsetMinutes());
  }, []);

  const dimension = useMemo(
    () => DIMENSIONS.find((d) => d.key === dimensionKey)!,
    [dimensionKey]
  );

  useEffect(() => {
    if (!dimension.weekAvailable && period === 'week') {
      setPeriod('all');
    }
  }, [dimension, period]);

  const query = useQuery({
    queryKey: [
      'leaderboard',
      dimensionKey,
      period,
      timezoneOffset
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        dimension: dimensionKey,
        period,
        timezoneOffsetMinutes: String(timezoneOffset ?? 0),
        page: '1',
        pageSize: '50'
      });
      return apiRequest<LeaderboardDto>(`/leaderboard?${params.toString()}`);
    },
    enabled: ready && timezoneOffset !== null,
    staleTime: 60_000
  });

  const data = query.data;

  const currentUserVisibleInList = useMemo(() => {
    if (!data?.entries || !data.currentUserEntry) return false;
    return data.entries.some((e) => e.isCurrentUser);
  }, [data]);

  const handleDimensionChange = (key: LeaderboardDimension) => {
    setDimensionKey(key);
    const d = DIMENSIONS.find((x) => x.key === key)!;
    if (!d.weekAvailable) {
      setPeriod('all');
    }
  };

  return (
    <AppShell title="学习排行榜">
      <div className="space-y-4" data-testid="leaderboard-page">
        <section className="card bg-gradient-to-br from-brand-50 via-white to-white" data-testid="leaderboard-header">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-title text-sm">
                <Trophy className="h-4 w-4 text-brand-600" aria-hidden="true" />
                学习排行榜
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {dimension.label}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {dimension.description}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-xs text-slate-400">参与用户</p>
              <p className="text-lg font-bold text-slate-700 tabular-nums">
                {data?.total ?? 0}
              </p>
            </div>
          </div>
        </section>

        <section className="card space-y-3 bg-white/95" data-testid="leaderboard-dimensions">
          <p className="section-title text-sm">
            <Trophy className="h-4 w-4 text-brand-600" aria-hidden="true" />
            选择排行维度
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIMENSIONS.map((d) => {
              const Icon = d.icon;
              const active = d.key === dimensionKey;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => handleDimensionChange(d.key)}
                  className={`flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all ${
                    active
                      ? 'border-brand-400 bg-brand-50 shadow-sm ring-2 ring-brand-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                  data-testid={`dimension-${d.key}`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      active ? 'text-brand-600' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <p
                    className={`text-sm font-medium ${
                      active ? 'text-brand-700' : 'text-slate-700'
                    }`}
                  >
                    {d.label}
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight line-clamp-2">
                    {d.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500 shrink-0">时间范围：</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {PERIODS.map((p) => {
                const active = p.key === period;
                const disabled = !dimension.weekAvailable && p.key === 'week';
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPeriod(p.key)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? 'bg-white text-brand-700 shadow-sm'
                        : disabled
                        ? 'text-slate-300 cursor-not-allowed'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                    data-testid={`period-${p.key}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {!dimension.weekAvailable ? (
              <span className="text-[10px] text-slate-400 shrink-0">
                （该维度仅支持总榜）
              </span>
            ) : null}
          </div>
        </section>

        {query.isLoading ? (
          <div className="status-neutral" data-testid="leaderboard-loading">
            加载中...
          </div>
        ) : query.isError ? (
          <div className="status-error" data-testid="leaderboard-error">
            加载失败，请稍后重试
          </div>
        ) : data ? (
          <>
            {data.currentUserEntry && !currentUserVisibleInList ? (
              <CurrentUserCard
                entry={data.currentUserEntry}
                dimension={dimension}
                visibleInList={false}
              />
            ) : null}

            <section
              className="card space-y-2 bg-white/95"
              data-testid="leaderboard-list"
            >
              <div className="flex items-center justify-between">
                <p className="section-title text-sm">
                  <Trophy className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  {period === 'week' ? '本周榜单' : '总榜'}
                </p>
                <span className="text-xs text-slate-400">
                  共 {data.total} 人参与
                </span>
              </div>

              {data.total === 0 ? (
                <div
                  className="status-neutral mt-4 py-10"
                  data-testid="leaderboard-empty"
                >
                  <User className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden="true" />
                  <p className="text-sm">
                    暂无排名数据
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    成为第一位学习者，开始你的学习之旅吧！
                  </p>
                </div>
              ) : data.entries.length === 0 ? (
                <div
                  className="status-neutral mt-4 py-8"
                  data-testid="leaderboard-page-empty"
                >
                  <p className="text-sm">当前页面暂无数据</p>
                </div>
              ) : (
                <ul className="space-y-2 pt-1">
                  {data.entries.map((entry) => (
                    <LeaderboardItem
                      key={`${entry.userId}-${entry.rank}`}
                      entry={entry}
                      dimension={dimension}
                    />
                  ))}
                </ul>
              )}
            </section>

            {data.currentUserEntry ? null : (
              <section
                className="card border-dashed border-slate-300 bg-slate-50/70"
                data-testid="leaderboard-not-ranked"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">
                      暂未上榜
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dimensionKey === 'grammar_accuracy'
                        ? '完成至少 5 道语法题即可参与语法正确率排行'
                        : dimensionKey === 'weekly_reviews'
                        ? period === 'week'
                          ? '完成至少 1 次复习即可参与本周复习量排行'
                          : '完成至少 1 次复习即可参与复习量排行'
                        : dimensionKey === 'streak_days'
                        ? '连续学习天数需要至少 1 天才能上榜'
                        : period === 'week'
                        ? '本周至少加入 1 个单词即可参与本周新增词汇排行'
                        : '加入至少 1 个单词到生词本即可参与累计词汇量排行'}
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
