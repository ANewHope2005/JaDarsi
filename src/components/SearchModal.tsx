import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Layers, Network, Search, X, CheckSquare } from 'lucide-react';
import { Lesson, MindmapNode, WorkspaceMode } from '../types/study';
import { isMindmapEmpty } from './ResourceManagerWorkspace';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  lessons: Lesson[];
  onNavigate: (lessonId: string, mode: WorkspaceMode, sectionId?: string) => void;
}

interface SearchHit {
  id: string;
  lessonId: string;
  lessonTitle: string;
  mode: WorkspaceMode;
  modeLabel: string;
  title: string;
  snippet: string;
  sectionId?: string;
}

function flattenMindmap(node: MindmapNode, out: MindmapNode[] = []): MindmapNode[] {
  out.push(node);
  node.children?.forEach((c) => flattenMindmap(c, out));
  return out;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onClose,
  lessons,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const index = useMemo<SearchHit[]>(() => {
    const items: SearchHit[] = [];
    for (const lesson of lessons) {
      for (const sec of lesson.sections) {
        items.push({
          id: `sec-${lesson.id}-${sec.id}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          mode: 'notes',
          modeLabel: 'جزوه',
          title: `${sec.number} ${sec.title}`,
          snippet: sec.paragraphs[0] ?? sec.markdownBody?.slice(0, 180) ?? '',
          sectionId: sec.id,
        });
      }
      if (!isMindmapEmpty(lesson.mindmap)) {
        for (const node of flattenMindmap(lesson.mindmap)) {
          items.push({
            id: `mm-${lesson.id}-${node.id}`,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            mode: 'mindmap',
            modeLabel: 'مایندمپ',
            title: node.title,
            snippet: node.formula ? `${node.formula} — ${node.summary}` : node.summary,
            sectionId: node.sectionId,
          });
        }
      }
      for (const card of lesson.flashcards) {
        items.push({
          id: `fc-${lesson.id}-${card.id}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          mode: 'flashcards',
          modeLabel: 'فلش‌کارت',
          title: card.front,
          snippet: card.back,
        });
      }
      for (const q of lesson.quiz) {
        items.push({
          id: `qz-${lesson.id}-${q.id}`,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          mode: 'quiz',
          modeLabel: 'آزمون',
          title: q.prompt,
          snippet: q.explanation,
        });
      }
    }
    return items;
  }, [lessons]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index.slice(0, 8);
    return index
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.snippet.toLowerCase().includes(q) ||
          item.lessonTitle.toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [index, query]);

  if (!open) return null;

  const modeIcon = (mode: WorkspaceMode) => {
    switch (mode) {
      case 'notes':
        return <BookOpen className="h-4 w-4 text-[#0D9488]" />;
      case 'mindmap':
        return <Network className="h-4 w-4 text-[#0D9488]" />;
      case 'flashcards':
        return <Layers className="h-4 w-4 text-[#D97706]" />;
      case 'quiz':
        return <CheckSquare className="h-4 w-4 text-[#475569]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 sm:pt-24">
      <div
        className="fixed inset-0 bg-[#0F172A]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="جستجو در جادرسی"
        className="elevation-tier-3 relative z-10 w-full max-w-[640px] overflow-hidden rounded-2xl bg-white dark:bg-[#1C252E]"
      >
        <div className="flex items-center gap-3 border-b border-[#E2E8F0] px-4 py-3.5 dark:border-[#27323E]">
          <Search className="h-4 w-4 shrink-0 text-[#64748B]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو میان جزوه‌ها، فرمول‌ها، مایندمپ، فلش‌کارت‌ها و آزمون‌ها..."
            className="w-full bg-transparent text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none dark:text-[#F8FAFC]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن جستجو"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {lessons.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
              هنوز درسی در جادرسی ایجاد نشده است. پس از افزودن درس و فایل‌های آموزشی، می‌توانید اینجا جستجو کنید.
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#64748B] dark:text-[#94A3B8]">
              {query.trim()
                ? `نتیجه‌ای برای «${query}» در جادرسی یافت نشد.`
                : 'محتوایی برای نمایش وجود ندارد. فایل‌های درس را در بخش مدیریت منابع بارگذاری کنید.'}
            </div>
          ) : (
            <ul className="space-y-1">
              {results.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(hit.lessonId, hit.mode, hit.sectionId);
                      onClose();
                    }}
                    className="flex w-full items-start gap-3 rounded-xl px-3.5 py-2.5 text-right transition-colors hover:bg-[#F4F5F7] dark:hover:bg-[#24303C]"
                  >
                    <div className="mt-1 shrink-0">{modeIcon(hit.mode)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                          {hit.title}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                          {hit.modeLabel} · {hit.lessonTitle}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                        {hit.snippet}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#FAF9F6] px-4 py-2 text-[11px] text-[#64748B] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#94A3B8]">
          <span>برای انتقال مستقیم روی هر مورد کلیک کنید</span>
          <kbd className="ltr-inline rounded bg-[#E2E8F0] px-1.5 py-0.5 font-mono text-[10px] text-[#334155] dark:bg-[#27323E] dark:text-[#CBD5E1]">
            ESC
          </kbd>
        </div>
      </div>
    </div>
  );
};
