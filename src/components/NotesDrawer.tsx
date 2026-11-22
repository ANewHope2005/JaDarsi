import React, { useState } from 'react';
import { Bookmark, Download, FileDown, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { Lesson, UserNote } from '../types/study';

interface NotesDrawerProps {
  open: boolean;
  onClose: () => void;
  activeLesson: Lesson | null;
  lessons: Lesson[];
  notes: UserNote[];
  bookmarkedSections: string[];
  onAddNote: (lessonId: string, title: string, content: string, sectionId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onJumpToBookmark: (lessonId: string, sectionId: string) => void;
}

export const NotesDrawer: React.FC<NotesDrawerProps> = ({
  open,
  onClose,
  activeLesson,
  lessons,
  notes,
  bookmarkedSections,
  onAddNote,
  onDeleteNote,
  onJumpToBookmark,
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'bookmarks'>('notes');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  if (!open) return null;

  const lessonNotes = activeLesson ? notes.filter((n) => n.lessonId === activeLesson.id) : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLesson || !title.trim() || !content.trim()) return;
    onAddNote(activeLesson.id, title.trim(), content.trim());
    setTitle('');
    setContent('');
  };

  const handleExportMarkdown = () => {
    if (!activeLesson) return;
    const mdLines = [
      `# یادداشت‌های مطالعه — ${activeLesson.title} (${activeLesson.code})`,
      '',
      ...lessonNotes.flatMap((n) => [`## ${n.title}`, n.content, `_${n.createdAt}_`, '']),
    ];
    const blob = new Blob([mdLines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${activeLesson.code.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resolvedBookmarks = bookmarkedSections
    .map((key) => {
      const [lId, sId] = key.split(':');
      const lesson = lessons.find((l) => l.id === lId);
      const section = lesson?.sections.find((s) => s.id === sId);
      if (!lesson || !section) return null;
      return { key, lesson, section };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="دفترچه یادداشت و نشانه‌گذاری‌ها"
        className="elevation-tier-3 relative z-10 flex h-full w-full max-w-[420px] flex-col bg-[#FAF9F6] dark:bg-[#161D24]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#27323E]">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              دفترچه حاشیه‌نویسی و فایل‌ها
            </h2>
            <p className="mt-0.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
              {activeLesson ? activeLesson.title : 'هنوز درسی انتخاب نشده است'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنل یادداشت‌ها"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-white dark:hover:bg-[#1C252E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="border-b border-[#E2E8F0] px-5 py-3 dark:border-[#27323E]">
          <div className="grid grid-cols-2 rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#1E293B]">
            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors ${
                activeTab === 'notes'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              <StickyNote className="h-3.5 w-3.5" />
              <span>یادداشت‌ها ({lessonNotes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bookmarks')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors ${
                activeTab === 'bookmarks'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] dark:text-[#94A3B8]'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span>نشان‌شده‌ها ({resolvedBookmarks.length})</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'notes' ? (
            <div className="space-y-6">
              {!activeLesson ? (
                <div className="rounded-xl border border-dashed border-[#CBD5E1] px-4 py-10 text-center text-xs leading-6 text-[#64748B] dark:border-[#364554] dark:text-[#94A3B8]">
                  برای ثبت یادداشت و حاشیه‌نویسی، ابتدا یک درس در جادرسی ایجاد کنید.
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]"
                >
                  <h3 className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    افزودن یادداشت جدید به این فصل
                  </h3>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="عنوان کوتاه یادداشت"
                    className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                  />
                  <textarea
                    required
                    rows={3}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="خلاصه، برداشت شخصی یا فرمول مورد نظر خود را بنویسید..."
                    className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-xs leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none focus:ring-3 focus:ring-[#0D9488]/15 dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                  />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0D9488] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>ذخیره در دفترچه</span>
                  </button>
                </form>
              )}

              {lessonNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#CBD5E1] py-10 text-center text-xs text-[#64748B] dark:border-[#364554] dark:text-[#94A3B8]">
                  هنوز یادداشتی برای این فصل ثبت نکرده‌اید.
                </div>
              ) : (
                <div className="space-y-3">
                  {lessonNotes.map((note) => (
                    <article
                      key={note.id}
                      className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          {note.title}
                        </h4>
                        <button
                          type="button"
                          onClick={() => onDeleteNote(note.id)}
                          aria-label="حذف یادداشت"
                          className="rounded p-1 text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:hover:bg-[#7F1D1D]/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[#334155] dark:text-[#CBD5E1]">
                        {note.content}
                      </p>
                      <div className="mt-3 text-[11px] text-[#94A3B8]">{note.createdAt}</div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {resolvedBookmarks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#CBD5E1] py-12 text-center text-xs text-[#64748B] dark:border-[#364554] dark:text-[#94A3B8]">
                  بخشی نشانه‌گذاری نشده است. از آیکون نشانک کنار عنوان هر بخش در جزوه استفاده کنید.
                </div>
              ) : (
                resolvedBookmarks.map(({ key, lesson, section }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onJumpToBookmark(lesson.id, section.id);
                      onClose();
                    }}
                    className="flex w-full flex-col rounded-xl border border-[#E2E8F0] bg-white p-3.5 text-right transition-colors hover:border-[#0D9488] dark:border-[#27323E] dark:bg-[#1C252E]"
                  >
                    <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      فصل {lesson.chapterNumber} · {lesson.title}
                    </span>
                    <span className="mt-1 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      {section.number} {section.title}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer Export Actions */}
        <div className="flex items-center gap-2 border-t border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
          <button
            type="button"
            disabled={!activeLesson}
            onClick={() => window.print()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] py-2 text-xs font-semibold text-[#1E293B] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] disabled:opacity-45 dark:border-[#364554] dark:bg-[#161D24] dark:text-[#E2E8F0]"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>خروجی PDF جزوه</span>
          </button>
          <button
            type="button"
            onClick={handleExportMarkdown}
            disabled={lessonNotes.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] py-2 text-xs font-semibold text-[#1E293B] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] disabled:opacity-45 dark:border-[#364554] dark:bg-[#161D24] dark:text-[#E2E8F0]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>دانلود Markdown</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
