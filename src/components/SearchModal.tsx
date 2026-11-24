import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckSquare,
  Filter,
  Network,
  Search,
  X,
} from 'lucide-react';
import { Flashcard, Lesson, MindmapNode, WorkspaceMode } from '../types/study';
import { stripInlineMarkdown } from '../utils/latexText';
import { isMindmapEmpty } from './ResourceManagerWorkspace';
import { FlashcardIcon } from './icons/FlashcardIcon';

export interface SearchNavigationTarget {
  lessonId: string;
  mode: WorkspaceMode;
  sectionId?: string;
  mindmapNodeId?: string;
  flashcardId?: string;
  quizQuestionId?: string;
}

type SearchContentType = 'all' | 'notes' | 'mindmap' | 'flashcards' | 'quiz';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  lessons: Lesson[];
  customCardsByLesson?: Record<string, Flashcard[]>;
  onNavigate: (target: SearchNavigationTarget) => void;
}

interface SearchHit {
  id: string;
  lessonId: string;
  lessonTitle: string;
  chapterNumber: number;
  mode: Exclude<SearchContentType, 'all'>;
  modeLabel: string;
  title: string;
  searchableBody: string;
  defaultSnippet: string;
  sectionId?: string;
  mindmapNodeId?: string;
  flashcardId?: string;
  quizQuestionId?: string;
}

const CONTENT_TYPE_FILTERS: {
  id: SearchContentType;
  label: string;
}[] = [
  { id: 'all', label: 'همه' },
  { id: 'notes', label: 'جزوه' },
  { id: 'mindmap', label: 'مایندمپ' },
  { id: 'flashcards', label: 'فلشکارت' },
  { id: 'quiz', label: 'آزمون تستی' },
];

function flattenMindmap(node: MindmapNode, out: MindmapNode[] = []): MindmapNode[] {
  out.push(node);
  node.children?.forEach((c) => flattenMindmap(c, out));
  return out;
}

function cleanPlainText(raw: string): string {
  return stripInlineMarkdown(raw)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildContextualSnippet(body: string, fallback: string, query: string): string {
  const source = body || fallback;
  if (!source) return '';
  const q = query.trim().toLowerCase();
  if (!q) {
    const base = fallback || source;
    return base.length > 150 ? `${base.slice(0, 147)}…` : base;
  }

  const idx = source.toLowerCase().indexOf(q);
  if (idx === -1) {
    const base = fallback || source;
    return base.length > 150 ? `${base.slice(0, 147)}…` : base;
  }

  const start = Math.max(0, idx - 48);
  const end = Math.min(source.length, idx + q.length + 92);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < source.length ? '…' : '';
  return `${prefix}${source.slice(start, end).trim()}${suffix}`;
}

function renderHighlightedMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q || !text) return text;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIdx = lowerText.indexOf(lowerQ, cursor);
  let key = 0;

  while (matchIdx !== -1) {
    if (matchIdx > cursor) {
      parts.push(
        <React.Fragment key={`t-${key++}`}>{text.slice(cursor, matchIdx)}</React.Fragment>
      );
    }
    parts.push(
      <mark
        key={`m-${key++}`}
        className="rounded bg-[#FEF08A]/90 px-0.5 text-[#0F172A] dark:bg-[#854D0E]/70 dark:text-[#FEF9C3]"
      >
        {text.slice(matchIdx, matchIdx + q.length)}
      </mark>
    );
    cursor = matchIdx + q.length;
    matchIdx = lowerText.indexOf(lowerQ, cursor);
  }

  if (cursor < text.length) {
    parts.push(<React.Fragment key={`e-${key++}`}>{text.slice(cursor)}</React.Fragment>);
  }

  return parts.length > 0 ? parts : text;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onClose,
  lessons,
  customCardsByLesson = {},
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [contentFilter, setContentFilter] = useState<SearchContentType>('all');
  const [lessonFilter, setLessonFilter] = useState<string>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setContentFilter('all');
      setLessonFilter('all');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  // Keep lessonFilter valid if lessons change
  useEffect(() => {
    if (lessonFilter !== 'all' && !lessons.some((l) => l.id === lessonFilter)) {
      setLessonFilter('all');
    }
  }, [lessons, lessonFilter]);

  const index = useMemo<SearchHit[]>(() => {
    const items: SearchHit[] = [];
    for (const lesson of lessons) {
      const lessonTitleClean = stripInlineMarkdown(lesson.title);

      // 1. Lecture Note sections
      for (const sec of lesson.sections) {
        const cleanTitle = `${sec.number} ${stripInlineMarkdown(sec.title)}`;
        const bodyParts: string[] = [];
        if (sec.markdownBody) bodyParts.push(cleanPlainText(sec.markdownBody));
        if (sec.paragraphs.length > 0) bodyParts.push(cleanPlainText(sec.paragraphs.join(' ')));
        if (sec.callouts?.length) {
          bodyParts.push(
            sec.callouts
              .map((c) => cleanPlainText(`${c.title} ${c.content} ${c.formula ?? ''}`))
              .join(' ')
          );
        }
        if (sec.keyPoints?.length) {
          bodyParts.push(cleanPlainText(sec.keyPoints.join(' ')));
        }
        if (sec.table) {
          bodyParts.push(
            cleanPlainText(
              [...sec.table.headers, ...sec.table.rows.flat()].join(' ')
            )
          );
        }
        const searchableBody = bodyParts.filter(Boolean).join(' ');
        items.push({
          id: `sec-${lesson.id}-${sec.id}`,
          lessonId: lesson.id,
          lessonTitle: lessonTitleClean,
          chapterNumber: lesson.chapterNumber,
          mode: 'notes',
          modeLabel: 'جزوه',
          title: cleanTitle,
          searchableBody,
          defaultSnippet: searchableBody.slice(0, 160),
          sectionId: sec.id,
        });
      }

      // 2. Mindmap / Knowledge Tree nodes
      if (!isMindmapEmpty(lesson.mindmap)) {
        for (const node of flattenMindmap(lesson.mindmap)) {
          const cleanTitle = stripInlineMarkdown(node.title);
          const extra = [
            node.subtitle ?? '',
            node.formula ?? '',
            ...(node.formulas ?? []),
            node.summary ?? '',
            ...(node.rules ?? []),
            ...(node.examples ?? []),
          ]
            .map((part) => cleanPlainText(part))
            .filter(Boolean)
            .join(' · ');

          items.push({
            id: `mm-${lesson.id}-${node.id}`,
            lessonId: lesson.id,
            lessonTitle: lessonTitleClean,
            chapterNumber: lesson.chapterNumber,
            mode: 'mindmap',
            modeLabel: 'مایندمپ',
            title: cleanTitle,
            searchableBody: extra,
            defaultSnippet: cleanPlainText(
              node.formula ? `${node.formula} — ${node.summary}` : node.summary
            ),
            sectionId: node.sectionId,
            mindmapNodeId: node.id,
          });
        }
      }

      // 3. Flashcards (imported + custom cards)
      const allCards = [...lesson.flashcards, ...(customCardsByLesson[lesson.id] ?? [])];
      for (const card of allCards) {
        const frontClean = cleanPlainText(card.front);
        const backClean = cleanPlainText(card.back);
        const searchableBody = [
          frontClean,
          card.frontFormula ?? '',
          backClean,
          card.backFormula ?? '',
          card.category ?? '',
        ]
          .filter(Boolean)
          .join(' — ');

        items.push({
          id: `fc-${lesson.id}-${card.id}`,
          lessonId: lesson.id,
          lessonTitle: lessonTitleClean,
          chapterNumber: lesson.chapterNumber,
          mode: 'flashcards',
          modeLabel: 'فلشکارت',
          title: frontClean,
          searchableBody,
          defaultSnippet: backClean,
          flashcardId: card.id,
        });
      }

      // 4. Quiz questions
      for (const q of lesson.quiz) {
        const promptClean = cleanPlainText(q.prompt);
        const optionsClean = q.options.map((o) => cleanPlainText(o.text)).join(' | ');
        const explanationClean = cleanPlainText(q.explanation);
        const searchableBody = [
          promptClean,
          q.promptFormula ?? '',
          optionsClean,
          explanationClean,
        ]
          .filter(Boolean)
          .join(' — ');

        items.push({
          id: `qz-${lesson.id}-${q.id}`,
          lessonId: lesson.id,
          lessonTitle: lessonTitleClean,
          chapterNumber: lesson.chapterNumber,
          mode: 'quiz',
          modeLabel: 'آزمون تستی',
          title: promptClean,
          searchableBody,
          defaultSnippet: explanationClean || optionsClean,
          quizQuestionId: q.id,
        });
      }
    }
    return items;
  }, [lessons, customCardsByLesson]);

  // Filter by selected lesson and query first (so content-type tab counts stay accurate)
  const lessonAndQueryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index.filter((item) => {
      if (lessonFilter !== 'all' && item.lessonId !== lessonFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.searchableBody.toLowerCase().includes(q) ||
        item.lessonTitle.toLowerCase().includes(q)
      );
    });
  }, [index, lessonFilter, query]);

  const countsByType = useMemo(() => {
    const counts: Record<SearchContentType, number> = {
      all: lessonAndQueryMatches.length,
      notes: 0,
      mindmap: 0,
      flashcards: 0,
      quiz: 0,
    };
    for (const item of lessonAndQueryMatches) {
      counts[item.mode]++;
    }
    return counts;
  }, [lessonAndQueryMatches]);

  const results = useMemo(() => {
    const filtered =
      contentFilter === 'all'
        ? lessonAndQueryMatches
        : lessonAndQueryMatches.filter((item) => item.mode === contentFilter);
    return filtered.slice(0, query.trim() ? 30 : 12);
  }, [lessonAndQueryMatches, contentFilter, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, contentFilter, lessonFilter]);

  const selectHit = (hit: SearchHit) => {
    onNavigate({
      lessonId: hit.lessonId,
      mode: hit.mode,
      sectionId: hit.mode === 'notes' ? hit.sectionId : undefined,
      mindmapNodeId: hit.mindmapNodeId,
      flashcardId: hit.flashcardId,
      quizQuestionId: hit.quizQuestionId,
    });
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown' && results.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp' && results.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' && results.length > 0) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'SELECT') return;
        e.preventDefault();
        const target = results[activeIndex] ?? results[0];
        if (target) selectHit(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, results, activeIndex]);

  if (!open) return null;

  const modeIcon = (mode: Exclude<SearchContentType, 'all'>) => {
    switch (mode) {
      case 'notes':
        return <BookOpen className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />;
      case 'mindmap':
        return <Network className="h-4 w-4 text-[#0284C7] dark:text-[#38BDF8]" />;
      case 'flashcards':
        return <FlashcardIcon className="h-4 w-4 text-[#D97706] dark:text-[#FBBF24]" />;
      case 'quiz':
        return <CheckSquare className="h-4 w-4 text-[#7C3AED] dark:text-[#A78BFA]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-12 sm:pt-20">
      <div
        className="fixed inset-0 bg-[#0F172A]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="جستجو در جادرسی"
        className="elevation-tier-3 relative z-10 w-full max-w-[720px] overflow-hidden rounded-2xl bg-white dark:bg-[#1C252E]"
      >
        {/* Top Search Input Row */}
        <div className="flex items-center gap-3 border-b border-[#E2E8F0] px-4 py-3.5 dark:border-[#27323E]">
          <Search className="h-4 w-4 shrink-0 text-[#64748B] dark:text-[#94A3B8]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو میان جزوه‌ها، فرمول‌ها، مایندمپ، فلشکارت‌ها و آزمون‌ها..."
            className="w-full bg-transparent text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none dark:text-[#F8FAFC]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="پاک کردن عبارت جستجو"
              className="rounded-md px-2 py-1 text-[11px] font-medium text-[#64748B] hover:bg-[#F1F5F9] dark:text-[#94A3B8] dark:hover:bg-[#27323E]"
            >
              پاک کردن
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن جستجو"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter Bar: Content Type Tabs + Lesson Selector */}
        {lessons.length > 0 && (
          <div className="flex flex-col gap-2.5 border-b border-[#E2E8F0] bg-[#FAF9F6] px-4 py-2.5 dark:border-[#27323E] dark:bg-[#161D24] sm:flex-row sm:items-center sm:justify-between">
            {/* Content Type Tabs */}
            <div className="flex flex-wrap items-center gap-1">
              {CONTENT_TYPE_FILTERS.map((tab) => {
                const isSelected = contentFilter === tab.id;
                const count = countsByType[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setContentFilter(tab.id)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors ${
                      isSelected
                        ? 'bg-[#0D9488] font-semibold text-white'
                        : 'bg-white text-[#475569] ring-1 ring-[#E2E8F0] hover:text-[#0F172A] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:ring-[#27323E] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        isSelected
                          ? 'text-white/90'
                          : 'text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Lesson / Session Filter Dropdown */}
            <div className="flex shrink-0 items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 shrink-0 text-[#64748B] dark:text-[#94A3B8]" />
              <select
                value={lessonFilter}
                onChange={(e) => setLessonFilter(e.target.value)}
                aria-label="فیلتر بر اساس درس"
                className="max-w-[210px] truncate rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1 text-xs font-medium text-[#1E293B] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0]"
              >
                <option value="all">همه درس‌ها ({lessons.length})</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    فصل {lesson.chapterNumber}: {stripInlineMarkdown(lesson.title)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Results List */}
        <div className="max-h-[420px] overflow-y-auto p-2">
          {lessons.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
              هنوز درسی در جادرسی ایجاد نشده است. پس از افزودن درس و فایل‌های آموزشی، می‌توانید اینجا جستجو کنید.
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
              {query.trim()
                ? `نتیجه‌ای برای «${query}» با فیلترهای انتخاب‌شده یافت نشد.`
                : 'محتوایی در این دسته‌بندی یافت نشد.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {results.map((hit, idx) => {
                const isActive = idx === activeIndex;
                const snippet = buildContextualSnippet(
                  hit.searchableBody,
                  hit.defaultSnippet,
                  query
                );
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => selectHit(hit)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3.5 py-2.5 text-right transition-colors ${
                        isActive
                          ? 'bg-[#F0FDFA] ring-1 ring-[#0D9488]/30 dark:bg-[#0F2928]/80 dark:ring-[#14B8A6]/35'
                          : 'hover:bg-[#F4F5F7] dark:hover:bg-[#24303C]'
                      }`}
                    >
                      <div className="mt-1 shrink-0">{modeIcon(hit.mode)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                            {renderHighlightedMatch(hit.title, query)}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                            {hit.modeLabel} · فصل {hit.chapterNumber}: {hit.lessonTitle}
                          </span>
                        </div>
                        {snippet && (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#64748B] dark:text-[#94A3B8]">
                            {renderHighlightedMatch(snippet, query)}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer Hints */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#FAF9F6] px-4 py-2 text-[11px] text-[#64748B] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#94A3B8]">
          <span>
            {results.length > 0
              ? `نمایش ${results.length} مورد — با کلیک یا Enter مستقیماً به بخش مربوطه بروید`
              : 'برای انتقال مستقیم روی هر مورد کلیک کنید'}
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 sm:inline-flex">
              <kbd className="ltr-inline rounded bg-[#E2E8F0] px-1.5 py-0.5 font-mono text-[10px] text-[#334155] dark:bg-[#27323E] dark:text-[#CBD5E1]">
                ↑↓
              </kbd>
              <span>انتخاب</span>
            </span>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <kbd className="ltr-inline rounded bg-[#E2E8F0] px-1.5 py-0.5 font-mono text-[10px] text-[#334155] dark:bg-[#27323E] dark:text-[#CBD5E1]">
                Enter
              </kbd>
              <span>رفتن</span>
            </span>
            <kbd className="ltr-inline rounded bg-[#E2E8F0] px-1.5 py-0.5 font-mono text-[10px] text-[#334155] dark:bg-[#27323E] dark:text-[#CBD5E1]">
              ESC
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
};
