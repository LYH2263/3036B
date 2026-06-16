'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock3,
  Coffee,
  Pause,
  Play,
  RefreshCcw,
  Settings,
  Target,
  TimerReset,
  Volume2,
  VolumeX,
  CalendarDays,
  Flame
} from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import { apiRequest } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';

type FocusPhase = 'focus' | 'short_break' | 'long_break';

interface FocusConfig {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
}

interface TimerState {
  phase: FocusPhase;
  startedAt: number | null;
  durationSec: number;
  paused: boolean;
  pausedAt: number | null;
  pausedElapsed: number;
  completedCycles: number;
  clientEventId: string | null;
}

interface FocusStats {
  today: {
    completedCount: number;
    totalDurationSec: number;
  };
  week: {
    completedCount: number;
    totalDurationSec: number;
    dailyBreakdown: Array<{ date: string; count: number; durationSec: number }>;
  };
  total: {
    completedCount: number;
    totalDurationSec: number;
  };
}

const DEFAULT_CONFIG: FocusConfig = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4
};

const STORAGE_KEY = 'focus-timer-state';
const CONFIG_KEY = 'focus-timer-config';

const PHASE_LABELS: Record<FocusPhase, string> = {
  focus: '专注中',
  short_break: '短休息',
  long_break: '长休息'
};

const PHASE_COLORS: Record<FocusPhase, string> = {
  focus: '#2563eb',
  short_break: '#16a34a',
  long_break: '#7c3aed'
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDurationHuman(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} 小时 ${rm} 分钟` : `${h} 小时`;
}

function generateClientEventId(): string {
  return `focus-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function FocusPage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<FocusConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const [timerState, setTimerState] = useState<TimerState>(() => {
    if (typeof window === 'undefined') {
      return {
        phase: 'focus',
        startedAt: null,
        durationSec: DEFAULT_CONFIG.focusMin * 60,
        paused: true,
        pausedAt: null,
        pausedElapsed: 0,
        completedCycles: 0,
        clientEventId: null
      };
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as TimerState;
      }
    } catch {
      // ignore
    }
    return {
      phase: 'focus',
      startedAt: null,
      durationSec: DEFAULT_CONFIG.focusMin * 60,
      paused: true,
      pausedAt: null,
      pausedElapsed: 0,
      completedCycles: 0,
      clientEventId: null
    };
  });

  const [now, setNow] = useState(() => Date.now());
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const audioCtxRef = useRef<AudioContext | null>(null);

  const statsQuery = useQuery({
    queryKey: ['focus-stats'],
    queryFn: () => apiRequest<FocusStats>('/focus/stats'),
    enabled: ready
  });

  const recordMutation = useMutation({
    mutationFn: (data: {
      phase: FocusPhase;
      durationSec: number;
      startedAt: string;
      endedAt: string;
      completed: boolean;
      interrupted?: boolean;
      actualDurationSec: number;
      clientEventId?: string;
    }) => apiRequest('/focus/sessions', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['focus-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
    }
  });

  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
  }, [timerState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission('unsupported');
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        const result = await Notification.requestPermission();
        setNotificationPermission(result);
      } catch {
        // ignore
      }
    }
  }, []);

  const playBeep = useCallback(
    (type: 'complete' | 'start' = 'complete') => {
      if (!soundEnabled) return;
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtxRef.current = new Ctx();
        }
        const ctx = audioCtxRef.current;
        const freqs = type === 'complete' ? [880, 660, 880] : [523, 659];
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          const start = ctx.currentTime + i * 0.2;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
          osc.start(start);
          osc.stop(start + 0.22);
        });
      } catch {
        // ignore
      }
    },
    [soundEnabled]
  );

  const sendNotification = useCallback(
    (title: string, body: string) => {
      if (notificationPermission !== 'granted') return;
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker?.controller) {
          void navigator.serviceWorker.ready.then((registration) => {
            void registration.showNotification(title, { body, icon: '/favicon.ico' });
          });
        } else if ('Notification' in window) {
          new Notification(title, { body });
        }
      } catch {
        // ignore
      }
    },
    [notificationPermission]
  );

  const getElapsedSec = useCallback(
    (state: TimerState, currentNow: number): number => {
      if (state.startedAt === null) return 0;
      if (state.paused && state.pausedAt !== null) {
        return state.pausedElapsed + Math.floor((state.pausedAt - state.startedAt) / 1000);
      }
      const total = currentNow - state.startedAt - state.pausedElapsed * 1000;
      return Math.max(0, Math.floor(total / 1000));
    },
    []
  );

  const remainingSec = useMemo(() => {
    const elapsed = getElapsedSec(timerState, now);
    return Math.max(0, timerState.durationSec - elapsed);
  }, [timerState, now, getElapsedSec]);

  const progress = useMemo(() => {
    if (timerState.durationSec === 0) return 0;
    const elapsed = getElapsedSec(timerState, now);
    return Math.min(1, elapsed / timerState.durationSec);
  }, [timerState, now, getElapsedSec]);

  const getDurationForPhase = useCallback(
    (phase: FocusPhase): number => {
      switch (phase) {
        case 'focus':
          return config.focusMin * 60;
        case 'short_break':
          return config.shortBreakMin * 60;
        case 'long_break':
          return config.longBreakMin * 60;
      }
    },
    [config]
  );

  const recordSession = useCallback(
    (params: {
      phase: FocusPhase;
      durationSec: number;
      startedAt: number;
      endedAt: number;
      completed: boolean;
      interrupted?: boolean;
      actualDurationSec: number;
      clientEventId: string;
    }) => {
      recordMutation.mutate({
        phase: params.phase,
        durationSec: params.durationSec,
        startedAt: new Date(params.startedAt).toISOString(),
        endedAt: new Date(params.endedAt).toISOString(),
        completed: params.completed,
        interrupted: params.interrupted,
        actualDurationSec: params.actualDurationSec,
        clientEventId: params.clientEventId
      });
    },
    [recordMutation]
  );

  const advanceToNextPhase = useCallback(
    (completedPhase: FocusPhase, currentCycles: number) => {
      let nextPhase: FocusPhase;
      let nextCycles = currentCycles;

      if (completedPhase === 'focus') {
        nextCycles = currentCycles + 1;
        if (nextCycles % config.longBreakEvery === 0) {
          nextPhase = 'long_break';
        } else {
          nextPhase = 'short_break';
        }
      } else {
        nextPhase = 'focus';
      }

      const duration = getDurationForPhase(nextPhase);
      setTimerState({
        phase: nextPhase,
        startedAt: Date.now(),
        durationSec: duration,
        paused: false,
        pausedAt: null,
        pausedElapsed: 0,
        completedCycles: nextCycles,
        clientEventId: generateClientEventId()
      });

      const label = PHASE_LABELS[nextPhase];
      playBeep('start');
      sendNotification(label, `${label}阶段开始！时长 ${Math.floor(duration / 60)} 分钟`);
    },
    [config.longBreakEvery, getDurationForPhase, playBeep, sendNotification]
  );

  useEffect(() => {
    if (!timerState.paused && timerState.startedAt !== null) {
      const elapsed = getElapsedSec(timerState, now);
      if (elapsed >= timerState.durationSec) {
        const endedAt = timerState.startedAt + timerState.durationSec * 1000 + timerState.pausedElapsed * 1000;

        if (timerState.phase === 'focus' && timerState.clientEventId) {
          recordSession({
            phase: 'focus',
            durationSec: timerState.durationSec,
            startedAt: timerState.startedAt,
            endedAt,
            completed: true,
            actualDurationSec: timerState.durationSec,
            clientEventId: timerState.clientEventId
          });
        }

        playBeep('complete');
        sendNotification(
          `${PHASE_LABELS[timerState.phase]}结束！`,
          timerState.phase === 'focus' ? '太棒了！专注完成，准备休息一下吧。' : '休息结束，准备继续专注吧！'
        );

        advanceToNextPhase(timerState.phase, timerState.completedCycles);
        return;
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timerState, now, getElapsedSec, playBeep, sendNotification, advanceToNextPhase, recordSession]);

  const handleStart = useCallback(() => {
    void requestNotificationPermission();
    setTimerState((prev) => {
      if (prev.startedAt !== null) {
        if (prev.paused && prev.pausedAt !== null) {
          const additionalPause = Date.now() - prev.pausedAt;
          return {
            ...prev,
            paused: false,
            pausedAt: null,
            pausedElapsed: prev.pausedElapsed + Math.floor(additionalPause / 1000)
          };
        }
        return prev;
      }
      const duration = getDurationForPhase(prev.phase);
      playBeep('start');
      return {
        ...prev,
        startedAt: Date.now(),
        durationSec: duration,
        paused: false,
        pausedAt: null,
        pausedElapsed: 0,
        clientEventId: generateClientEventId()
      };
    });
  }, [getDurationForPhase, playBeep, requestNotificationPermission]);

  const handlePause = useCallback(() => {
    setTimerState((prev) => ({
      ...prev,
      paused: true,
      pausedAt: Date.now()
    }));
  }, []);

  const handleReset = useCallback(() => {
    setTimerState((prev) => {
      if (prev.startedAt !== null && prev.phase === 'focus' && prev.clientEventId) {
        const elapsed = getElapsedSec(prev, Date.now());
        if (elapsed > 60) {
          recordSession({
            phase: 'focus',
            durationSec: prev.durationSec,
            startedAt: prev.startedAt,
            endedAt: Date.now(),
            completed: false,
            interrupted: true,
            actualDurationSec: elapsed,
            clientEventId: prev.clientEventId
          });
        }
      }
      return {
        phase: 'focus',
        startedAt: null,
        durationSec: config.focusMin * 60,
        paused: true,
        pausedAt: null,
        pausedElapsed: 0,
        completedCycles: prev.completedCycles,
        clientEventId: null
      };
    });
  }, [config.focusMin, getElapsedSec, recordSession]);

  const handleSwitchPhase = useCallback(
    (phase: FocusPhase) => {
      setTimerState((prev) => {
        if (prev.startedAt !== null && prev.phase === 'focus' && prev.clientEventId) {
          const elapsed = getElapsedSec(prev, Date.now());
          if (elapsed > 60) {
            recordSession({
              phase: 'focus',
              durationSec: prev.durationSec,
              startedAt: prev.startedAt,
              endedAt: Date.now(),
              completed: false,
              interrupted: true,
              actualDurationSec: elapsed,
              clientEventId: prev.clientEventId
            });
          }
        }
        return {
          phase,
          startedAt: null,
          durationSec: getDurationForPhase(phase),
          paused: true,
          pausedAt: null,
          pausedElapsed: 0,
          completedCycles: prev.completedCycles,
          clientEventId: null
        };
      });
    },
    [getDurationForPhase, getElapsedSec, recordSession]
  );

  const phaseColor = PHASE_COLORS[timerState.phase];
  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress);

  const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <AppShell title="专注计时">
      <div className="space-y-5" data-testid="focus-page">
        <section className="card bg-white/95" data-testid="focus-timer-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 className="section-title">番茄钟</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary h-9 px-3"
                onClick={() => setSoundEnabled((s) => !s)}
                title={soundEnabled ? '关闭提示音' : '开启提示音'}
                data-testid="focus-sound-toggle"
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                className="btn-secondary h-9 px-3"
                onClick={() => setShowSettings((s) => !s)}
                title="设置时长"
                data-testid="focus-settings-btn"
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" data-testid="focus-phase-tabs">
            {(['focus', 'short_break', 'long_break'] as FocusPhase[]).map((phase) => (
              <button
                key={phase}
                type="button"
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  timerState.phase === phase
                    ? 'text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
                style={
                  timerState.phase === phase
                    ? { backgroundColor: PHASE_COLORS[phase] }
                    : undefined
                }
                onClick={() => handleSwitchPhase(phase)}
                data-testid={`focus-phase-${phase}`}
              >
                {phase === 'focus' ? (
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" aria-hidden="true" />
                    专注
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Coffee className="h-3.5 w-3.5" aria-hidden="true" />
                    {phase === 'short_break' ? '短休' : '长休'}
                  </span>
                )}
              </button>
            ))}
          </div>

          {showSettings ? (
            <div className="mt-4 rounded-[var(--radius-control)] border border-slate-200 bg-slate-50/60 p-4 space-y-3" data-testid="focus-settings-panel">
              <p className="text-sm font-medium text-slate-700">时长设置（分钟）</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">专注</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={config.focusMin}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(120, parseInt(e.target.value) || 1));
                      setConfig((c) => ({ ...c, focusMin: v }));
                      if (timerState.phase === 'focus' && timerState.startedAt === null) {
                        setTimerState((t) => ({ ...t, durationSec: v * 60 }));
                      }
                    }}
                    className="input-control h-9"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">短休</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={config.shortBreakMin}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
                      setConfig((c) => ({ ...c, shortBreakMin: v }));
                      if (timerState.phase === 'short_break' && timerState.startedAt === null) {
                        setTimerState((t) => ({ ...t, durationSec: v * 60 }));
                      }
                    }}
                    className="input-control h-9"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">长休</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={config.longBreakMin}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
                      setConfig((c) => ({ ...c, longBreakMin: v }));
                      if (timerState.phase === 'long_break' && timerState.startedAt === null) {
                        setTimerState((t) => ({ ...t, durationSec: v * 60 }));
                      }
                    }}
                    className="input-control h-9"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">长休间隔（每 N 个专注周期）</label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={config.longBreakEvery}
                  onChange={(e) => {
                    const v = Math.max(2, Math.min(10, parseInt(e.target.value) || 4));
                    setConfig((c) => ({ ...c, longBreakEvery: v }));
                  }}
                  className="input-control h-9"
                />
              </div>
              {notificationPermission === 'default' ? (
                <button
                  type="button"
                  className="btn-secondary w-full text-xs"
                  onClick={requestNotificationPermission}
                >
                  启用浏览器通知
                </button>
              ) : notificationPermission === 'denied' ? (
                <p className="text-xs text-amber-600">通知权限已被拒绝，可在浏览器设置中开启。</p>
              ) : notificationPermission === 'granted' ? (
                <p className="text-xs text-emerald-600">✓ 通知权限已开启</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex justify-center" data-testid="focus-timer-ring">
            <div className="relative">
              <svg width="280" height="280" viewBox="0 0 280 280" className="transform -rotate-90">
                <circle
                  cx="140"
                  cy="140"
                  r="120"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="14"
                />
                <circle
                  cx="140"
                  cy="140"
                  r="120"
                  fill="none"
                  stroke={phaseColor}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-sm font-medium mb-1"
                  style={{ color: phaseColor }}
                  data-testid="focus-phase-label"
                >
                  {PHASE_LABELS[timerState.phase]}
                </span>
                <span
                  className="text-6xl font-bold tracking-tight tabular-nums text-slate-900"
                  data-testid="focus-timer-display"
                >
                  {formatDuration(remainingSec)}
                </span>
                <span className="mt-2 text-xs text-slate-500">
                  本轮第 {timerState.completedCycles + (timerState.phase === 'focus' ? 1 : 0)} 个 · 累计 {timerState.completedCycles} 个
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3" data-testid="focus-controls">
            <button
              type="button"
              className="btn-secondary h-11 px-4"
              onClick={handleReset}
              data-testid="focus-reset-btn"
            >
              <TimerReset className="h-4 w-4" aria-hidden="true" />
              重置
            </button>
            {timerState.paused ? (
              <button
                type="button"
                className="btn-primary h-11 px-8 text-base"
                onClick={handleStart}
                data-testid="focus-start-btn"
                style={
                  timerState.phase !== 'focus'
                    ? { background: `linear-gradient(180deg, ${phaseColor} 0%, ${phaseColor}dd 100%)` }
                    : undefined
                }
              >
                <Play className="h-5 w-5" aria-hidden="true" />
                {timerState.startedAt === null ? '开始' : '继续'}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary h-11 px-8 text-base"
                onClick={handlePause}
                data-testid="focus-pause-btn"
                style={
                  timerState.phase !== 'focus'
                    ? { background: `linear-gradient(180deg, ${phaseColor} 0%, ${phaseColor}dd 100%)` }
                    : undefined
                }
              >
                <Pause className="h-5 w-5" aria-hidden="true" />
                暂停
              </button>
            )}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="focus-stats">
          <div className="card card-hover bg-white/95" data-testid="focus-card-today">
            <p className="stat-label">
              <CalendarDays className="h-4 w-4 text-brand-500" aria-hidden="true" />
              今日专注
            </p>
            <p className="stat-value">{statsQuery.data?.today.completedCount ?? 0} 次</p>
            <p className="mt-1 text-xs text-slate-500">
              累计 {formatDurationHuman(statsQuery.data?.today.totalDurationSec ?? 0)}
            </p>
          </div>
          <div className="card card-hover bg-white/95" data-testid="focus-card-week">
            <p className="stat-label">
              <Flame className="h-4 w-4 text-brand-500" aria-hidden="true" />
              本周专注
            </p>
            <p className="stat-value">{statsQuery.data?.week.completedCount ?? 0} 次</p>
            <p className="mt-1 text-xs text-slate-500">
              累计 {formatDurationHuman(statsQuery.data?.week.totalDurationSec ?? 0)}
            </p>
          </div>
          <div className="card card-hover bg-white/95" data-testid="focus-card-total">
            <p className="stat-label">
              <Target className="h-4 w-4 text-brand-500" aria-hidden="true" />
              历史累计
            </p>
            <p className="stat-value">{statsQuery.data?.total.completedCount ?? 0} 次</p>
            <p className="mt-1 text-xs text-slate-500">
              累计 {formatDurationHuman(statsQuery.data?.total.totalDurationSec ?? 0)}
            </p>
          </div>
        </section>

        {statsQuery.data?.week.dailyBreakdown ? (
          <section className="card bg-white/95" data-testid="focus-week-chart">
            <h2 className="section-title">
              <BarChart3Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
              本周每日分布
            </h2>
            <div className="mt-4 grid grid-cols-7 gap-2">
              {statsQuery.data.week.dailyBreakdown.map((day, idx) => {
                const maxCount = Math.max(1, ...statsQuery.data!.week.dailyBreakdown.map((d) => d.count));
                const heightPct = (day.count / maxCount) * 100;
                const today = new Date();
                const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10);
                const isToday = day.date === todayStr;
                return (
                  <div key={day.date} className="flex flex-col items-center gap-2" data-testid={`focus-week-day-${idx}`}>
                    <div className="flex h-28 w-full items-end justify-center">
                      <div
                        className={`w-full max-w-[32px] rounded-t-md transition-all ${
                          isToday ? 'bg-brand-500' : 'bg-slate-300'
                        }`}
                        style={{ height: `${Math.max(heightPct, day.count > 0 ? 8 : 2)}%`, minHeight: '4px' }}
                        title={`${day.count} 次 · ${formatDurationHuman(day.durationSec)}`}
                      />
                    </div>
                    <span className={`text-xs font-medium ${isToday ? 'text-brand-700' : 'text-slate-500'}`}>
                      {weekDays[idx]}
                    </span>
                    <span className="text-xs text-slate-400">{day.count}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {statsQuery.isLoading ? (
          <div className="status-neutral" data-testid="focus-loading">
            加载中...
          </div>
        ) : null}

        {recordMutation.isError ? (
          <div className="status-error" data-testid="focus-record-error">
            记录失败，请检查网络后重试。
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function BarChart3Icon({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      <path d="M3 3v18h18" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-6" />
    </svg>
  );
}
