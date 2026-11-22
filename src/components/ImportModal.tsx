import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  FileUp,
  Layers,
  Network,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Lesson } from '../types/study';
import {
  detectJsonKind,
  ParsedMarkdownLesson,
  ParsedMindmapImport,
  ParsedQuizImport,
  parseFlashcardsCsv,
  parseMarkdownLesson,
  parseMindmapJson,
  parseQuizJson,
} from '../utils/importers';
import { Flashcard } from '../types/study';

export interface LessonImportPayload {
  mode: 'update' | 'create';
  title: string;
  course: string;
  code: string;
  markdown?: ParsedMarkdownLesson;
  flashcards?: Flashcard[];
  quiz?: ParsedQuizImport;
  mindmap?: ParsedMindmapImport;
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  activeLesson: Lesson | null;
  nextChapterNumber: number;
  onApplyImport: (payload: LessonImportPayload) => void;
  onDeleteCustomLesson?: (lessonId: string) => void;
}

type SlotKey = 'markdown' | 'flashcards' | 'quiz' | 'mindmap';

interface SlotState<T> {
  fileName: string;
  data: T | null;
  error: string | null;
  summary: string;
}

const EMPTY_SLOT = <T,>(): SlotState<T> => ({
  fileName: '',
  data: null,
  error: null,
  summary: '',
});

export const ImportModal: React.FC<ImportModalProps> = ({
  open,
  onClose,
  activeLesson,
  nextChapterNumber,
  onApplyImport,
  onDeleteCustomLesson,
}) => {
  const [importMode, setImportMode] = useState<'update' | 'create'>(
    activeLesson ? 'update' : 'create'
  );
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [code, setCode] = useState('');
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [mdSlot, setMdSlot] = useState<SlotState<ParsedMarkdownLesson>>(EMPTY_SLOT);
  const [csvSlot, setCsvSlot] = useState<SlotState<Flashcard[]>>(EMPTY_SLOT);
  const [quizSlot, setQuizSlot] = useState<SlotState<ParsedQuizImport>>(EMPTY_SLOT);
  const [mmSlot, setMmSlot] = useState<SlotState<ParsedMindmapImport>>(EMPTY_SLOT);

  const mdInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const quizInputRef = useRef<HTMLInputElement>(null);
  const mmInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setImportMode(activeLesson ? 'update' : 'create');
    setTitle('');
    setCourse('');
    setCode('');
    setGlobalError(null);
    setMdSlot(EMPTY_SLOT());
    setCsvSlot(EMPTY_SLOT());
    setQuizSlot(EMPTY_SLOT());
    setMmSlot(EMPTY_SLOT());
  }, [open, activeLesson?.id]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const effectiveMode: 'update' | 'create' = activeLesson ? importMode : 'create';
  const targetChapterNum =
    effectiveMode === 'create' ? nextChapterNumber : activeLesson!.chapterNumber;

  const processFileForSlot = async (file: File, forcedSlot?: SlotKey) => {
    setGlobalError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const text = await file.text();

    let targetSlot: SlotKey | null = forcedSlot ?? null;
    if (!targetSlot) {
      if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
        targetSlot = 'markdown';
      } else if (ext === 'csv') {
        targetSlot = 'flashcards';
      } else if (ext === 'json') {
        const kind = detectJsonKind(text);
        if (kind === 'quiz') targetSlot = 'quiz';
        else if (kind === 'mindmap') targetSlot = 'mindmap';
        else {
          setGlobalError(
            `نوع فایل JSON «${file.name}» به صورت خودکار تشخیص داده نشد. لطفاً آن را مستقیماً در کادر آزمون یا درخت دانش بارگذاری کنید.`
          );
          return;
        }
      } else {
        setGlobalError(`پسوند فایل «${file.name}» پشتیبانی نمی‌شود. فرمت‌های مجاز: .md، .csv، .json`);
        return;
      }
    }

    if (targetSlot === 'markdown') {
      try {
        const parsed = parseMarkdownLesson(text, targetChapterNum);
        setMdSlot({
          fileName: file.name,
          data: parsed,
          error: null,
          summary: `${parsed.sections.length} بخش · ${parsed.readingMinutes} دقیقه مطالعه`,
        });
        if (!title && parsed.title) setTitle(parsed.title);
      } catch (err) {
        setMdSlot({
          fileName: file.name,
          data: null,
          error: err instanceof Error ? err.message : 'خطا در خواندن فایل Markdown',
          summary: '',
        });
      }
      return;
    }

    if (targetSlot === 'flashcards') {
      try {
        const parsed = parseFlashcardsCsv(
          text,
          effectiveMode === 'create' ? `new-${nextChapterNumber}` : activeLesson!.id
        );
        setCsvSlot({
          fileName: file.name,
          data: parsed,
          error: null,
          summary: `${parsed.length} فلش‌کارت آماده ورود`,
        });
      } catch (err) {
        setCsvSlot({
          fileName: file.name,
          data: null,
          error: err instanceof Error ? err.message : 'خطا در خواندن فایل CSV',
          summary: '',
        });
      }
      return;
    }

    if (targetSlot === 'quiz') {
      try {
        const parsed = parseQuizJson(text);
        const multiCount = parsed.questions.filter((q) => q.type === 'multi').length;
        setQuizSlot({
          fileName: file.name,
          data: parsed,
          error: null,
          summary: `${parsed.questions.length} سوال (${multiCount} چندگزینه‌ای)`,
        });
        if (!title && parsed.title) setTitle(parsed.title);
      } catch (err) {
        setQuizSlot({
          fileName: file.name,
          data: null,
          error: err instanceof Error ? err.message : 'خطا در خواندن JSON آزمون',
          summary: '',
        });
      }
      return;
    }

    if (targetSlot === 'mindmap') {
      try {
        const parsed = parseMindmapJson(text);
        setMmSlot({
          fileName: file.name,
          data: parsed,
          error: null,
          summary: `${parsed.nodeCount} گره مفهومی در درخت دانش`,
        });
        if (!title && parsed.title) setTitle(parsed.title);
        if (!course && parsed.course) setCourse(parsed.course);
      } catch (err) {
        setMmSlot({
          fileName: file.name,
          data: null,
          error: err instanceof Error ? err.message : 'خطا در خواندن JSON درخت دانش',
          summary: '',
        });
      }
    }
  };

  const handleFileList = async (files: FileList | null, forcedSlot?: SlotKey) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await processFileForSlot(file, forcedSlot);
    }
  };

  const hasAnyValidImport = Boolean(mdSlot.data || csvSlot.data || quizSlot.data || mmSlot.data);
  const canSubmit =
    effectiveMode === 'update'
      ? hasAnyValidImport
      : Boolean(title.trim() || hasAnyValidImport);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const resolvedTitle =
      title.trim() ||
      mdSlot.data?.title ||
      mmSlot.data?.title ||
      quizSlot.data?.title ||
      (effectiveMode === 'create' ? `فصل ${nextChapterNumber}: درس جدید` : activeLesson!.title);

    const resolvedCourse =
      course.trim() ||
      mmSlot.data?.course ||
      (effectiveMode === 'create' ? 'درس‌های شخصی جادرسی' : activeLesson!.course);

    const resolvedCode =
      code.trim() ||
      (effectiveMode === 'create' ? `JDR-${100 + nextChapterNumber}` : activeLesson!.code);

    onApplyImport({
      mode: effectiveMode,
      title: resolvedTitle,
      course: resolvedCourse,
      code: resolvedCode,
      markdown: mdSlot.data ?? undefined,
      flashcards: csvSlot.data ?? undefined,
      quiz: quizSlot.data ?? undefined,
      mindmap: mmSlot.data ?? undefined,
    });
    onClose();
  };

  const slots: {
    key: SlotKey;
    label: string;
    accept: string;
    formatHint: string;
    icon: React.ComponentType<{ className?: string }>;
    state: SlotState<unknown>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    clear: () => void;
  }[] = [
    {
      key: 'markdown',
      label: 'جزوه درسی (.md)',
      accept: '.md,.markdown,.txt',
      formatHint: 'پشتیبانی کامل از فارسی راست‌چین، تیترها، جدول، کد و فرمول‌های LaTeX',
      icon: BookOpen,
      state: mdSlot,
      inputRef: mdInputRef,
      clear: () => setMdSlot(EMPTY_SLOT()),
    },
    {
      key: 'flashcards',
      label: 'فلش‌کارت (.csv)',
      accept: '.csv',
      formatHint: 'فایل دو ستونی بدون هدر (question,answer) با پشتیبانی ویرگول داخل گیومه و LaTeX',
      icon: Layers,
      state: csvSlot,
      inputRef: csvInputRef,
      clear: () => setCsvSlot(EMPTY_SLOT()),
    },
    {
      key: 'quiz',
      label: 'آزمون تستی (.json)',
      accept: '.json',
      formatHint: 'ساختار { title, questions } شامل single_choice و multiple_select',
      icon: CheckSquare,
      state: quizSlot,
      inputRef: quizInputRef,
      clear: () => setQuizSlot(EMPTY_SLOT()),
    },
    {
      key: 'mindmap',
      label: 'درخت دانش / مایندمپ (.json)',
      accept: '.json',
      formatHint: 'ساختار { metadata, knowledge_tree, splitting_tree_models } با زیرشاخه، مثال، قانون و جدول',
      icon: Network,
      state: mmSlot,
      inputRef: mmInputRef,
      clear: () => setMmSlot(EMPTY_SLOT()),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-[#0F172A]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="ورود فایل‌ها و مدیریت درس"
        className="elevation-tier-3 relative z-10 flex max-h-[90vh] w-full max-w-[740px] flex-col overflow-hidden rounded-2xl bg-[#FAF9F6] dark:bg-[#161D24]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4 dark:border-[#27323E] dark:bg-[#1C252E]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F0FDFA] text-[#0D9488] dark:bg-[#0F2928] dark:text-[#2DD4BF]">
              <FileUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                ورود فایل‌ها و مدیریت درس
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                بارگذاری جزوه، فلش‌کارت، آزمون و درخت دانش در فرمت‌های استاندارد
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Mode Segmented Toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#E2E8F0] p-1 dark:bg-[#1E293B]">
              <button
                type="button"
                disabled={!activeLesson}
                onClick={() => activeLesson && setImportMode('update')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  effectiveMode === 'update'
                    ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                    : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>به‌روزرسانی درس فعال</span>
              </button>
              <button
                type="button"
                onClick={() => setImportMode('create')}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs transition-colors ${
                  effectiveMode === 'create'
                    ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                    : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ ایجاد درس جدید</span>
              </button>
            </div>

            {/* Active Lesson Context OR New Lesson Metadata Fields */}
            {effectiveMode === 'update' && activeLesson ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-xs dark:border-[#27323E] dark:bg-[#1C252E]">
                <div>
                  <span className="text-[#64748B] dark:text-[#94A3B8]">درس فعال برای به‌روزرسانی:</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      فصل {activeLesson.chapterNumber}: {activeLesson.title}
                    </span>
                    <span className="ltr-inline font-mono text-[11px] text-[#0F766E] dark:text-[#2DD4BF]">
                      {activeLesson.code}
                    </span>
                  </div>
                </div>
                {onDeleteCustomLesson && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteCustomLesson(activeLesson.id);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-1.5 text-xs font-medium text-[#DC2626] transition-colors hover:bg-[#FEE2E2] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/30 dark:text-[#F87171]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>حذف این درس</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E] sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                    عنوان فصل / درس جدید
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثلاً: درخت‌های تصمیم و جنگل تصادفی (یا تکمیل خودکار از فایل)"
                    className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                    کد درس (اختیاری)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={`IMP-${100 + nextChapterNumber}`}
                    className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                    نام درس یا گروه علمی (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    placeholder="مثلاً: یادگیری ماشین کاربردی"
                    className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                  />
                </div>
              </div>
            )}

            {/* Global Multi-File Smart Drag & Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingGlobal(true);
              }}
              onDragLeave={() => setIsDraggingGlobal(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingGlobal(false);
                void handleFileList(e.dataTransfer.files);
              }}
              onClick={() => multiInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  multiInputRef.current?.click();
                }
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors ${
                isDraggingGlobal
                  ? 'border-[#0D9488] bg-[#F0FDFA] dark:border-[#14B8A6] dark:bg-[#0F2928]/70'
                  : 'border-[#CBD5E1] bg-white hover:border-[#0D9488]/60 dark:border-[#364554] dark:bg-[#1C252E]'
              }`}
            >
              <Upload className="h-6 w-6 text-[#0D9488] dark:text-[#2DD4BF]" />
              <p className="mt-2 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                فایل‌ها را اینجا بکشید و رها کنید یا برای انتخاب گروهی کلیک کنید
              </p>
              <p className="mt-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                تشخیص خودکار <span className="ltr-inline font-mono">.md</span> ·{' '}
                <span className="ltr-inline font-mono">.csv</span> ·{' '}
                <span className="ltr-inline font-mono">.json</span> (آزمون و درخت دانش)
              </p>
              <input
                ref={multiInputRef}
                type="file"
                multiple
                accept=".md,.markdown,.csv,.json"
                className="hidden"
                onChange={(e) => {
                  void handleFileList(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {globalError && (
              <div className="flex items-start gap-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-xs text-[#B91C1C] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/30 dark:text-[#FCA5A5]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{globalError}</span>
              </div>
            )}

            {/* Four Individual File Slots */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {slots.map((slot) => {
                const Icon = slot.icon;
                const hasData = Boolean(slot.state.data);
                const hasError = Boolean(slot.state.error);

                return (
                  <div
                    key={slot.key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleFileList(e.dataTransfer.files, slot.key);
                    }}
                    className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                      hasError
                        ? 'border-[#FCA5A5] bg-[#FEF2F2]/60 dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/20'
                        : hasData
                        ? 'border-[#6EE7B7] bg-[#ECFDF5]/60 dark:border-[#047857]/70 dark:bg-[#064E3B]/25'
                        : 'border-[#E2E8F0] bg-white dark:border-[#27323E] dark:bg-[#1C252E]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]" />
                          <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            {slot.label}
                          </span>
                        </div>

                        {slot.state.fileName && (
                          <button
                            type="button"
                            onClick={slot.clear}
                            aria-label={`حذف فایل ${slot.label}`}
                            className="rounded p-1 text-[#64748B] hover:bg-black/5 hover:text-[#DC2626] dark:hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="mt-1.5 text-[11px] leading-5 text-[#64748B] dark:text-[#94A3B8]">
                        {slot.formatHint}
                      </p>
                    </div>

                    <div className="mt-3">
                      {hasData && (
                        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[#047857] dark:text-[#34D399]">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {slot.state.fileName} — {slot.state.summary}
                          </span>
                        </div>
                      )}

                      {hasError && (
                        <div className="mb-2 flex items-start gap-1.5 text-[11px] font-medium text-[#DC2626] dark:text-[#F87171]">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{slot.state.error}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => slot.inputRef.current?.click()}
                        className="w-full rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] py-1.5 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF]"
                      >
                        {slot.state.fileName ? 'انتخاب فایل جایگزین' : 'انتخاب فایل'}
                      </button>
                      <input
                        ref={slot.inputRef}
                        type="file"
                        accept={slot.accept}
                        className="hidden"
                        onChange={(e) => {
                          void handleFileList(e.target.files, slot.key);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-[#E2E8F0] bg-white px-6 py-4 dark:border-[#27323E] dark:bg-[#1C252E]">
            <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              {effectiveMode === 'update'
                ? 'فقط بخش‌هایی که فایل جدید برایشان انتخاب شده به‌روزرسانی می‌شوند.'
                : 'می‌توانید بلافاصله فایل‌های درس را اضافه کنید یا بعداً در مدیریت منابع بارگذاری نمایید.'}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569] transition-colors hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1] dark:hover:bg-[#24303C]"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-lg bg-[#0D9488] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {effectiveMode === 'update' ? 'ذخیره در درس فعال' : 'ایجاد درس جدید'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
