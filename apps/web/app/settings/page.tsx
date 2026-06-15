'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Palette,
  Settings as SettingsIcon,
  Target,
  User,
  Volume2
} from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import { apiRequest, ApiError } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import type {
  ChangePasswordDto,
  UpdatePreferencesDto,
  UpdateProfileDto,
  UserPreferencesDto,
  UserProfileDto
} from '@lexigram/shared';

const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899'
];

const ACCENT_OPTIONS = [
  { value: 'en-US', label: '美式英语 (US)' },
  { value: 'en-GB', label: '英式英语 (UK)' },
  { value: 'en-AU', label: '澳式英语 (AU)' }
];

const DAILY_GOAL_OPTIONS = [5, 10, 15, 20, 30, 50, 100];

function getInitial(name: string | null, email: string): string {
  if (name && name.trim()) {
    return name.trim().charAt(0).toUpperCase();
  }
  return email.charAt(0).toUpperCase();
}

function validatePasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: '弱', color: 'bg-red-500' };
  if (score <= 2) return { score, label: '一般', color: 'bg-amber-500' };
  if (score <= 3) return { score, label: '中等', color: 'bg-yellow-500' };
  if (score <= 4) return { score, label: '强', color: 'bg-emerald-500' };
  return { score, label: '非常强', color: 'bg-emerald-600' };
}

export default function SettingsPage() {
  const { ready } = useRequireAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => apiRequest<UserProfileDto>('/user/profile'),
    enabled: ready
  });

  const preferencesQuery = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => apiRequest<UserPreferencesDto>('/user/preferences'),
    enabled: ready
  });

  const [nicknameInput, setNicknameInput] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  const [accentValue, setAccentValue] = useState('en-US');
  const [dailyGoalValue, setDailyGoalValue] = useState(20);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const [preferencesSaveError, setPreferencesSaveError] = useState<string | null>(null);
  const [preferencesSaveSuccess, setPreferencesSaveSuccess] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    if (profileQuery.data) {
      setNicknameInput(profileQuery.data.nickname ?? '');
      setSelectedColor(profileQuery.data.avatarColor ?? null);
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (preferencesQuery.data) {
      setAccentValue(preferencesQuery.data.defaultAccent);
      setDailyGoalValue(preferencesQuery.data.dailyGoal);
      setReminderEnabled(preferencesQuery.data.reviewReminderEnabled);
    }
  }, [preferencesQuery.data]);

  useEffect(() => {
    if (!profileQuery.data) return;
    const origNick = profileQuery.data.nickname ?? '';
    const origColor = profileQuery.data.avatarColor ?? null;
    const dirty = nicknameInput.trim() !== origNick || selectedColor !== origColor;
    setProfileDirty(dirty);
    if (dirty) setProfileSaveSuccess(false);
  }, [nicknameInput, selectedColor, profileQuery.data]);

  useEffect(() => {
    if (!preferencesQuery.data) return;
    const dirty =
      accentValue !== preferencesQuery.data.defaultAccent ||
      dailyGoalValue !== preferencesQuery.data.dailyGoal ||
      reminderEnabled !== preferencesQuery.data.reviewReminderEnabled;
    setPreferencesDirty(dirty);
    if (dirty) setPreferencesSaveSuccess(false);
  }, [accentValue, dailyGoalValue, reminderEnabled, preferencesQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: (dto: UpdateProfileDto) =>
      apiRequest<UserProfileDto>('/user/profile', {
        method: 'PATCH',
        body: JSON.stringify(dto)
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-profile'], data);
      setProfileSaveSuccess(true);
      setProfileSaveError(null);
      setTimeout(() => setProfileSaveSuccess(false), 2500);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : '保存失败，请稍后重试';
      setProfileSaveError(message);
    }
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (dto: UpdatePreferencesDto) =>
      apiRequest<UserPreferencesDto>('/user/preferences', {
        method: 'PATCH',
        body: JSON.stringify(dto)
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preferences'], data);
      setPreferencesSaveSuccess(true);
      setPreferencesSaveError(null);
      setTimeout(() => setPreferencesSaveSuccess(false), 2500);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : '保存失败，请稍后重试';
      setPreferencesSaveError(message);
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: (dto: ChangePasswordDto) =>
      apiRequest('/user/change-password', {
        method: 'POST',
        body: JSON.stringify(dto)
      }),
    onSuccess: () => {
      setPasswordSuccess(true);
      setPasswordError(null);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : '修改失败，请稍后重试';
      setPasswordError(message);
    }
  });

  const handleSaveProfile = useCallback(() => {
    if (updateProfileMutation.isPending) return;
    const dto: UpdateProfileDto = {};
    if (nicknameInput.trim() !== (profileQuery.data?.nickname ?? '')) {
      dto.nickname = nicknameInput.trim();
    }
    if (selectedColor !== (profileQuery.data?.avatarColor ?? null)) {
      dto.avatarColor = selectedColor ?? undefined;
    }
    updateProfileMutation.mutate(dto);
  }, [nicknameInput, selectedColor, profileQuery.data, updateProfileMutation]);

  const handleSavePreferences = useCallback(() => {
    if (updatePreferencesMutation.isPending) return;
    const dto: UpdatePreferencesDto = {
      defaultAccent: accentValue,
      dailyGoal: dailyGoalValue,
      reviewReminderEnabled: reminderEnabled
    };
    updatePreferencesMutation.mutate(dto);
  }, [accentValue, dailyGoalValue, reminderEnabled, updatePreferencesMutation]);

  const handleChangePassword = useCallback(() => {
    if (changePasswordMutation.isPending) return;
    setPasswordError(null);

    if (!oldPassword) {
      setPasswordError('请输入旧密码');
      return;
    }
    if (!newPassword) {
      setPasswordError('请输入新密码');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码长度至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    if (newPassword === oldPassword) {
      setPasswordError('新密码不能与旧密码相同');
      return;
    }

    changePasswordMutation.mutate({ oldPassword, newPassword });
  }, [oldPassword, newPassword, confirmPassword, changePasswordMutation]);

  const passwordStrength = useMemo(() => validatePasswordStrength(newPassword), [newPassword]);

  const initial = profileQuery.data
    ? getInitial(profileQuery.data.nickname, profileQuery.data.email)
    : '?';

  const displayColor = selectedColor ?? profileQuery.data?.avatarColor ?? '#3b82f6';

  const profileLoading = profileQuery.isLoading || profileQuery.isFetching;
  const preferencesLoading = preferencesQuery.isLoading || preferencesQuery.isFetching;

  return (
    <AppShell title="个人设置">
      <div className="space-y-5" data-testid="settings-page">
        <section className="card bg-white/95" data-testid="settings-account-card">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h2 className="section-title">账号信息</h2>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="text-sm text-slate-500">邮箱</span>
              </div>
              <span className="text-sm font-medium text-slate-800">
                {profileQuery.data?.email ?? '—'}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <SettingsIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="text-sm text-slate-500">注册时间</span>
              </div>
              <span className="text-sm font-medium text-slate-800">
                {profileQuery.data?.createdAt ?? '—'}
              </span>
            </div>
          </div>
        </section>

        <section className="card bg-white/95" data-testid="settings-profile-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 className="section-title">个人资料</h2>
            </div>
            {profileSaveSuccess && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                已保存
              </span>
            )}
          </div>

          <div className="mt-4 flex items-start gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-sm"
              style={{ backgroundColor: displayColor }}
              data-testid="settings-avatar"
            >
              {initial}
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500">昵称</label>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="请输入昵称"
                  maxLength={32}
                  className="input-control mt-1.5 h-10"
                  data-testid="settings-nickname-input"
                />
                <p className="mt-1 text-xs text-slate-400">{nicknameInput.length}/32</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500">头像颜色</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                        selectedColor === color
                          ? 'ring-2 ring-offset-2 ring-brand-500'
                          : 'ring-1 ring-slate-200'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedColor(color)}
                      data-testid={`settings-color-${color.replace('#', '')}`}
                      aria-label={`选择颜色 ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {profileSaveError && (
            <div className="status-error mt-4" data-testid="settings-profile-error">
              {profileSaveError}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn-primary h-9 px-5"
              onClick={handleSaveProfile}
              disabled={!profileDirty || updateProfileMutation.isPending || profileLoading}
              data-testid="settings-profile-save-btn"
            >
              {updateProfileMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存资料'
              )}
            </button>
          </div>
        </section>

        <section className="card bg-white/95" data-testid="settings-preferences-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h2 className="section-title">学习偏好</h2>
            </div>
            {preferencesSaveSuccess && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                已保存
              </span>
            )}
          </div>

          <div className="mt-4 space-y-5">
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Volume2 className="h-3.5 w-3.5" />
                默认发音口音
              </label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {ACCENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                      accentValue === opt.value
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                    onClick={() => setAccentValue(opt.value)}
                    data-testid={`settings-accent-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Target className="h-3.5 w-3.5" />
                每日学习目标（单词数）
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAILY_GOAL_OPTIONS.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    className={`rounded-xl border px-4 py-1.5 text-sm transition-all ${
                      dailyGoalValue === goal
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                    onClick={() => setDailyGoalValue(goal)}
                    data-testid={`settings-goal-${goal}`}
                  >
                    {goal} 个
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center gap-3">
                {reminderEnabled ? (
                  <Bell className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                ) : (
                  <BellOff className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-800">复习提醒</p>
                  <p className="text-xs text-slate-500">
                    {reminderEnabled ? '已开启每日复习提醒' : '已关闭复习提醒'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  reminderEnabled ? 'bg-brand-500' : 'bg-slate-300'
                }`}
                onClick={() => setReminderEnabled((v) => !v)}
                data-testid="settings-reminder-toggle"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    reminderEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {preferencesSaveError && (
            <div className="status-error mt-4" data-testid="settings-preferences-error">
              {preferencesSaveError}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn-primary h-9 px-5"
              onClick={handleSavePreferences}
              disabled={
                !preferencesDirty ||
                updatePreferencesMutation.isPending ||
                preferencesLoading
              }
              data-testid="settings-preferences-save-btn"
            >
              {updatePreferencesMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存偏好'
              )}
            </button>
          </div>
        </section>

        <section className="card bg-white/95" data-testid="settings-password-card">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h2 className="section-title">修改密码</h2>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500">旧密码</label>
              <div className="relative mt-1.5">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => {
                    setOldPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="请输入当前密码"
                  className="input-control h-10 pr-10"
                  data-testid="settings-old-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowOldPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showOldPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500">新密码</label>
              <div className="relative mt-1.5">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="请输入新密码（至少 6 位）"
                  className="input-control h-10 pr-10"
                  data-testid="settings-new-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowNewPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {newPassword && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full ${passwordStrength.color} transition-all`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{passwordStrength.label}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500">确认新密码</label>
              <div className="relative mt-1.5">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="请再次输入新密码"
                  className="input-control h-10 pr-10"
                  data-testid="settings-confirm-password"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {confirmPassword && newPassword && (
                <p
                  className={`mt-1 text-xs ${
                    confirmPassword === newPassword
                      ? 'text-emerald-600'
                      : 'text-red-500'
                  }`}
                >
                  {confirmPassword === newPassword ? '✓ 两次密码一致' : '✗ 两次密码不一致'}
                </p>
              )}
            </div>
          </div>

          {passwordError && (
            <div className="status-error mt-4" data-testid="settings-password-error">
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div className="status-success mt-4" data-testid="settings-password-success">
              ✓ 密码修改成功！下次登录请使用新密码。
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn-primary h-9 px-5"
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending}
              data-testid="settings-change-password-btn"
            >
              {changePasswordMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  修改中...
                </>
              ) : (
                '修改密码'
              )}
            </button>
          </div>
        </section>

        {(profileLoading || preferencesLoading) && (
          <div className="status-neutral" data-testid="settings-loading">
            加载中...
          </div>
        )}
      </div>
    </AppShell>
  );
}
