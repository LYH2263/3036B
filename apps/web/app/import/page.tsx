'use client';

import type { ImportParseResultDto, BatchAddResultDto } from '@lexigram/shared';
import { useMutation } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronsUpDown,
  ClipboardPaste,
  FileText,
  Filter,
  Loader2,
  Volume2,
  XCircle
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { apiRequest } from '../../lib/api';
import { useRequireAuth } from '../../lib/auth';
import { speakWord } from '../../lib/tts';

type Phase = 'input' | 'parsing' | 'result' | 'adding';

export default function ImportPage() {
  const { ready } = useRequireAuth();

  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [parseResult, setParseResult] = useState<ImportParseResultDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addResult, setAddResult] = useState<BatchAddResultDto | null>(null);
  const [sortBy, setSortBy] = useState<'frequency' | 'word'>('frequency');

  const parseMutation = useMutation({
    mutationFn: (inputText: string) =>
      apiRequest<ImportParseResultDto>('/import/parse', {
        method: 'POST',
        body: JSON.stringify({ text: inputText }),
        timeoutMs: 30000
      }),
    onSuccess: (data) => {
      setParseResult(data);
      setSelectedIds(new Set());
      setAddResult(null);
      setPhase('result');
    },
    onError: () => {
      setPhase('input');
    }
  });

  const batchAddMutation = useMutation({
    mutationFn: (wordEntryIds: string[]) =>
      apiRequest<BatchAddResultDto>('/import/batch-add', {
        method: 'POST',
        body: JSON.stringify({ wordEntryIds }),
        timeoutMs: 30000
      }),
    onSuccess: (data) => {
      setAddResult(data);
      setPhase('adding');
    }
  });

  const handleParse = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPhase('parsing');
    parseMutation.mutate(trimmed);
  }, [text, parseMutation]);

  const handleSelectAll = useCallback(() => {
    if (!parseResult) return;
    const allIds = new Set(parseResult.candidates.map((c) => c.wordEntryId));
    setSelectedIds(allIds);
  }, [parseResult]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, [parseResult]);

  const handleInvertSelection = useCallback(() => {
    if (!parseResult) return;
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const c of parseResult.candidates) {
        if (prev.has(c.wordEntryId)) {
          continue;
        }
        next.add(c.wordEntryId);
      }
      return next;
    });
  }, [parseResult]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBatchAdd = useCallback(() => {
    if (selectedIds.size === 0) return;
    batchAddMutation.mutate([...selectedIds]);
  }, [selectedIds, batchAddMutation]);

  const handleReset = useCallback(() => {
    setPhase('input');
    setText('');
    setParseResult(null);
    setSelectedIds(new Set());
    setAddResult(null);
  }, []);

  const sortedCandidates = useMemo(() => {
    if (!parseResult) return [];
    const list = [...parseResult.candidates];
    if (sortBy === 'frequency') {
      list.sort((a, b) => b.frequency - a.frequency);
    } else {
      list.sort((a, b) => a.word.localeCompare(b.word));
    }
    return list;
  }, [parseResult, sortBy]);

  const isAllSelected = parseResult
    ? parseResult.candidates.length > 0 && selectedIds.size === parseResult.candidates.length
    : false;

  return (
    <AppShell title="文章生词提取">
      <div className="space-y-5" data-testid="import-page">
        {phase === 'input' && (
          <section className="card space-y-4 bg-white/95" data-testid="import-input-section">
            <h2 className="section-title">
              <ClipboardPaste className="h-4 w-4 text-brand-600" aria-hidden="true" />
              粘贴文章
            </h2>
            <p className="section-subtitle">
              粘贴一段英文文章，系统将自动提取其中的生词供你选择加入生词本。
            </p>
            <textarea
              className="input-control min-h-[200px] resize-y p-3"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="在此粘贴英文文章内容..."
              maxLength={50000}
              data-testid="import-text-input"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500" data-testid="import-char-count">
                {text.length} / 50000 字符
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleParse}
                disabled={!text.trim()}
                data-testid="import-parse-btn"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                开始提取
              </button>
            </div>
          </section>
        )}

        {phase === 'parsing' && (
          <section className="card space-y-4 bg-white/95" data-testid="import-parsing-section">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700">正在解析文章并提取生词...</p>
            </div>
          </section>
        )}

        {phase === 'result' && parseResult && (
          <>
            <section className="card space-y-4 bg-white/95" data-testid="import-stats-section">
              <h2 className="section-title">
                <Filter className="h-4 w-4 text-brand-600" aria-hidden="true" />
                解析结果
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="import-stats-grid">
                <div className="rounded-[var(--radius-control)] border border-slate-200 bg-slate-50/60 p-3 text-center">
                  <p className="text-xs text-slate-500">提取词数</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900" data-testid="import-stat-total">
                    {parseResult.totalExtracted}
                  </p>
                </div>
                <div className="rounded-[var(--radius-control)] border border-slate-200 bg-slate-50/60 p-3 text-center">
                  <p className="text-xs text-slate-500">停用词</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900" data-testid="import-stat-stopwords">
                    {parseResult.stopwordsFiltered}
                  </p>
                </div>
                <div className="rounded-[var(--radius-control)] border border-slate-200 bg-slate-50/60 p-3 text-center">
                  <p className="text-xs text-slate-500">已掌握</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900" data-testid="import-stat-mastered">
                    {parseResult.masteredFiltered}
                  </p>
                </div>
                <div className="rounded-[var(--radius-control)] border border-slate-200 bg-slate-50/60 p-3 text-center">
                  <p className="text-xs text-slate-500">候选生词</p>
                  <p className="mt-1 text-lg font-semibold text-brand-600" data-testid="import-stat-candidates">
                    {parseResult.candidates.length}
                  </p>
                </div>
              </div>

              {parseResult.notInDictionary.length > 0 && (
                <div className="status-neutral" data-testid="import-not-in-dict">
                  <p className="text-xs font-medium">词库中未收录的词（{parseResult.notInDictionary.length} 个）：</p>
                  <p className="mt-1 text-xs">
                    {parseResult.notInDictionary.slice(0, 30).join(', ')}
                    {parseResult.notInDictionary.length > 30 ? '...' : ''}
                  </p>
                </div>
              )}
            </section>

            <section className="card space-y-4 bg-white/95" data-testid="import-candidates-section">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">
                  候选生词（{parseResult.candidates.length}）
                </h2>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    排序：
                    <select
                      className="input-control h-8 w-24 px-1 text-xs"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'frequency' | 'word')}
                      data-testid="import-sort-select"
                    >
                      <option value="frequency">按词频</option>
                      <option value="word">按字母</option>
                    </select>
                  </label>
                </div>
              </div>

              {parseResult.candidates.length === 0 ? (
                <div className="status-success" data-testid="import-no-candidates">
                  <CheckCircle2 className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                  文章中没有发现新的生词，所有单词都已掌握或不在词库中。
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2" data-testid="import-selection-controls">
                    <button
                      type="button"
                      className="btn-secondary h-8 px-3 text-xs"
                      onClick={isAllSelected ? handleDeselectAll : handleSelectAll}
                      data-testid="import-select-all-btn"
                    >
                      {isAllSelected ? '取消全选' : '全选'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-8 px-3 text-xs"
                      onClick={handleInvertSelection}
                      data-testid="import-invert-btn"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                      反选
                    </button>
                    <span className="flex items-center text-xs text-slate-500" data-testid="import-selected-count">
                      已选 {selectedIds.size} 个
                    </span>
                  </div>

                  <div className="space-y-2" data-testid="import-candidate-list">
                    {sortedCandidates.map((candidate) => {
                      const isSelected = selectedIds.has(candidate.wordEntryId);
                      return (
                        <label
                          key={candidate.wordEntryId}
                          className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-3 transition-colors ${
                            isSelected
                              ? 'border-brand-300 bg-brand-50/60'
                              : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                          }`}
                          data-testid={`import-candidate-${candidate.wordEntryId}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(candidate.wordEntryId)}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            data-testid={`import-checkbox-${candidate.wordEntryId}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-semibold">{candidate.word}</span>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-brand-600"
                                onClick={(e) => {
                                  e.preventDefault();
                                  speakWord(candidate.word);
                                }}
                                data-testid={`import-pronounce-${candidate.wordEntryId}`}
                              >
                                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <span className="text-xs text-slate-500">
                                词频 {candidate.frequency}
                              </span>
                            </div>
                            <p className="mt-0.5 text-sm text-slate-600">
                              {candidate.phonetic || '暂无音标'}
                            </p>
                            <p className="mt-1 text-sm text-slate-700">{candidate.definition}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleReset}
                      data-testid="import-back-btn"
                    >
                      重新粘贴
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleBatchAdd}
                      disabled={selectedIds.size === 0 || batchAddMutation.isPending}
                      data-testid="import-batch-add-btn"
                    >
                      {batchAddMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          加入中...
                        </>
                      ) : (
                        <>加入生词本（{selectedIds.size}）</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {phase === 'adding' && addResult && (
          <section className="card space-y-4 bg-white/95" data-testid="import-result-section">
            <h2 className="section-title">
              <CheckCircle2 className="h-4 w-4 text-brand-600" aria-hidden="true" />
              加入结果
            </h2>

            <div className="grid grid-cols-3 gap-3" data-testid="import-result-stats">
              <div className="rounded-[var(--radius-control)] border border-emerald-200 bg-emerald-50 p-3 text-center">
                <p className="text-xs text-emerald-600">成功加入</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700" data-testid="import-result-added">
                  {addResult.added}
                </p>
              </div>
              <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 p-3 text-center">
                <p className="text-xs text-amber-600">已存在</p>
                <p className="mt-1 text-2xl font-bold text-amber-700" data-testid="import-result-exists">
                  {addResult.alreadyExists}
                </p>
              </div>
              <div className="rounded-[var(--radius-control)] border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">词库缺失</p>
                <p className="mt-1 text-2xl font-bold text-slate-600" data-testid="import-result-notfound">
                  {addResult.notFound}
                </p>
              </div>
            </div>

            {addResult.details.length > 0 && (
              <div className="space-y-2" data-testid="import-result-details">
                {addResult.details.map((detail) => (
                  <div
                    key={detail.wordEntryId}
                    className={`flex items-center gap-2 rounded-[var(--radius-control)] border p-2 text-sm ${
                      detail.status === 'added'
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : detail.status === 'already_exists'
                          ? 'border-amber-200 bg-amber-50/60'
                          : 'border-slate-200 bg-slate-50/60'
                    }`}
                    data-testid={`import-result-item-${detail.wordEntryId}`}
                  >
                    {detail.status === 'added' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : detail.status === 'already_exists' ? (
                      <span className="text-xs font-medium text-amber-600">已有</span>
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    )}
                    <span className="font-medium">{detail.word}</span>
                    <span className="text-xs text-slate-500">
                      {detail.status === 'added'
                        ? '已加入'
                        : detail.status === 'already_exists'
                          ? '已在生词本中'
                          : '词库中未找到'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              onClick={handleReset}
              data-testid="import-restart-btn"
            >
              继续导入
            </button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
