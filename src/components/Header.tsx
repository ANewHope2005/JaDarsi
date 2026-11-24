import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Eye,
  FileDown,
  FileUp,
  FolderOpen,
  Leaf,
  Library,
  Menu,
  Monitor,
  Moon,
  Network,
  PanelTopClose,
  PanelTopOpen,
  Search,
  StickyNote,
  Sun,
  CheckSquare,
  Check,
} from 'lucide-react';
import { Course, Lesson, ThemePreference, WorkspaceMode } from '../types/study';
import {
  LiveReadingSnapshot,
  ReadingCheckpoint,
  StudyTimerController,
  StudyTimerWidget,
} from './StudyTimerWidget';
import { FlashcardIcon } from './icons/FlashcardIcon';
import { FocusTargetIcon } from './icons/FocusTargetIcon';
import { HoverTooltip } from './ui/HoverTooltip';

interface HeaderProps {
  courses?: Course[];
  lessons: Lesson[];
  activeLesson: Lesson | null;
  onSelectLesson: (lessonId: string) => void;
  workspaceMode: WorkspaceMode;
  onChangeMode: (mode: WorkspaceMode) => void;
  fontScale: number;
  onAdjustFontScale: (delta: number) => void;
  themePreference: ThemePreference;
  isDark: boolean;
  systemPrefersDark: boolean;
  onChangeThemePreference: (pref: ThemePreference) => void;
  onOpenSearch: () => void;
  onOpenDrawer: () => void;
  onOpenImportModal: () => void;
  onOpenMobileSyllabus: () => void;
  notesCount: number;
  lessonMasteryMap: Record<string, number>;
  headerCollapsed: boolean;
  onToggleHeaderCollapsed: () => void;
  isFullFocusMode?: boolean;
  onExitFocusMode?: () => void;
  studyTimer: StudyTimerController;
  activeLessonStudySeconds: number;
  liveReadingSnapshot?: LiveReadingSnapshot | null;
  activeLessonCheckpoint?: ReadingCheckpoint | null;
  onSaveStudySession?: (elapsedSeconds: number) => void;
}

const MODE_ITEMS: { id: WorkspaceMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'notes', label: 'جزوه', icon: BookOpen },
  { id: 'mindmap', label: 'مایندمپ', icon: Network },
  { id: 'flashcards', label: 'فلش‌کارت', icon: FlashcardIcon },
  { id: 'quiz', label: 'آزمون تستی', icon: CheckSquare },
];

export const Header: React.FC<HeaderProps> = ({
  courses = [],
  lessons,
  activeLesson,
  onSelectLesson,
  workspaceMode,
  onChangeMode,
  fontScale,
  onAdjustFontScale,
  themePreference,
  isDark,
  systemPrefersDark,
  onChangeThemePreference,
  onOpenSearch,
  onOpenDrawer,
  onOpenImportModal,
  onOpenMobileSyllabus,
  notesCount,
  lessonMasteryMap,
  headerCollapsed,
  onToggleHeaderCollapsed,
  isFullFocusMode = false,
  onExitFocusMode,
  studyTimer,
  activeLessonStudySeconds,
  liveReadingSnapshot,
  activeLessonCheckpoint,
  onSaveStudySession,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedCourseKey, setExpandedCourseKey] = useState<string | null>(null);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const desktopThemeRef = useRef<HTMLDivElement>(null);
  const mobileThemeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDesktop = desktopDropdownRef.current?.contains(target) ?? false;
      const insideMobile = mobileDropdownRef.current?.contains(target) ?? false;
      if (!insideDesktop && !insideMobile) {
        setDropdownOpen(false);
      }

      const insideDesktopTheme = desktopThemeRef.current?.contains(target) ?? false;
      const insideMobileTheme = mobileThemeRef.current?.contains(target) ?? false;
      if (!insideDesktopTheme && !insideMobileTheme) {
        setThemeMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  useEffect(() => {
    if (headerCollapsed) {
      setDropdownOpen(false);
      setThemeMenuOpen(false);
    }
  }, [headerCollapsed]);

  // Default to expanding only the active course whenever the dropdown opens
  useEffect(() => {
    if (!dropdownOpen) return;
    if (activeLesson) {
      const matchedCourse = courses.find((c) =>
        activeLesson.courseId ? c.id === activeLesson.courseId : c.name === activeLesson.course
      );
      setExpandedCourseKey(matchedCourse?.id ?? activeLesson.courseId ?? activeLesson.course ?? null);
    } else if (courses.length > 0) {
      setExpandedCourseKey(courses[0].id);
    } else {
      setExpandedCourseKey(null);
    }
  }, [dropdownOpen, activeLesson, courses]);

  const handlePrint = () => {
    window.print();
  };

  const themeTooltip =
    themePreference === 'system'
      ? `پوسته: خودکار سیستم (اکنون ${systemPrefersDark ? 'شب' : 'روز'})`
      : themePreference === 'eye-comfort'
      ? 'پوسته: راحتی چشم (Eye Comfort)'
      : themePreference === 'sage'
      ? 'پوسته: سبز آرامش‌بخش (مطالعه طولانی)'
      : themePreference === 'midnight'
      ? 'پوسته: شب گرم (کم‌خستگی چشم)'
      : themePreference === 'dark'
      ? 'پوسته: حالت شب (دستی)'
      : 'پوسته: حالت روز (دستی)';

  const renderThemeTriggerIcon = () => {
    if (themePreference === 'system') {
      return (
        <span className="relative flex items-center justify-center">
          <Monitor className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -left-0.5 h-1.5 w-1.5 rounded-full bg-[#0D9488] dark:bg-[#2DD4BF]"
          />
        </span>
      );
    }
    if (themePreference === 'eye-comfort') {
      return <Eye className="h-4 w-4 text-[#B45309]" />;
    }
    if (themePreference === 'sage') {
      return <Leaf className="h-4 w-4 text-[#15803D]" />;
    }
    if (themePreference === 'midnight') {
      return <Moon className="h-4 w-4 text-[#EAB308]" />;
    }
    return isDark ? (
      <Moon className="h-4 w-4 text-[#60A5FA]" />
    ) : (
      <Sun className="h-4 w-4 text-[#D97706]" />
    );
  };

  const renderThemePopover = () => {
    const options: {
      id: ThemePreference;
      label: string;
      hint: string;
      swatch: string;
      icon: React.ComponentType<{ className?: string }>;
    }[] = [
      {
        id: 'system',
        label: 'خودکار (سیستم)',
        hint: systemPrefersDark ? 'اکنون: شب' : 'اکنون: روز',
        swatch: 'bg-gradient-to-tr from-[#0F172A] to-[#FAF9F6]',
        icon: Monitor,
      },
      {
        id: 'light',
        label: 'حالت روز',
        hint: 'کاغذ روشن کلاسیک',
        swatch: 'bg-[#FAF9F6]',
        icon: Sun,
      },
      {
        id: 'eye-comfort',
        label: 'راحتی چشم (Eye Comfort)',
        hint: 'کاغذ گرم کم‌نورآبی',
        swatch: 'bg-[#F3E9D2]',
        icon: Eye,
      },
      {
        id: 'sage',
        label: 'سبز آرامش‌بخش',
        hint: 'پس‌زمینه سبز ملایم مطالعه',
        swatch: 'bg-[#E5ECE6]',
        icon: Leaf,
      },
      {
        id: 'dark',
        label: 'حالت شب',
        hint: 'مطالعه در تاریکی',
        swatch: 'bg-[#161D24]',
        icon: Moon,
      },
      {
        id: 'midnight',
        label: 'شب گرم (کم‌خستگی)',
        hint: 'تاریک ملایم بدون زنندگی',
        swatch: 'bg-[#1B1815]',
        icon: Moon,
      },
    ];

    return (
      <div
        role="menu"
        aria-label="انتخاب پوسته ظاهری"
        className="elevation-tier-3 absolute left-0 z-50 mt-2 w-60 rounded-xl bg-white p-1.5 dark:bg-[#1C252E]"
      >
        <div className="border-b border-[#E2E8F0] px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-[#64748B] dark:border-[#27323E] dark:text-[#94A3B8]">
          پوسته نمایش و راحتی چشم
        </div>
        <div className="mt-1 space-y-0.5">
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = themePreference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChangeThemePreference(opt.id);
                  setThemeMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-xs transition-colors ${
                  active
                    ? 'bg-[#F0FDFA] font-semibold text-[#0F766E] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                    : 'text-[#1E293B] hover:bg-[#F8FAFC] dark:text-[#E2E8F0] dark:hover:bg-[#24303C]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 rounded-full border border-[#94A3B8]/50 ${opt.swatch}`}
                  />
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    <span className="text-[10px] font-normal text-[#64748B] dark:text-[#94A3B8]">
                      {opt.hint}
                    </span>
                  </div>
                </div>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const activeCourseSessionCount = activeLesson
    ? lessons.filter((l) =>
        activeLesson.courseId
          ? l.courseId === activeLesson.courseId
          : l.course === activeLesson.course
      ).length
    : 0;

  const groupedCoursesForMenu = (() => {
    const groups: { courseId?: string; courseName: string; items: Lesson[] }[] = [];
    if (courses.length > 0) {
      const used = new Set<string>();
      for (const c of courses) {
        const items = lessons.filter((l) =>
          l.courseId ? l.courseId === c.id : l.course === c.name
        );
        items.forEach((item) => used.add(item.id));
        groups.push({ courseId: c.id, courseName: c.name, items });
      }
      const leftover = lessons.filter((l) => !used.has(l.id));
      if (leftover.length > 0) {
        groups.push({ courseName: 'سایر جلسات', items: leftover });
      }
    } else if (lessons.length > 0) {
      const byCourse = new Map<string, Lesson[]>();
      for (const l of lessons) {
        const key = l.course || 'درس‌های من';
        byCourse.set(key, [...(byCourse.get(key) ?? []), l]);
      }
      byCourse.forEach((items, courseName) => groups.push({ courseName, items }));
    }
    return groups;
  })();

  const renderDropdownMenu = (fullWidthMobile: boolean) => (
    <div
      className={`elevation-tier-3 absolute top-full z-50 mt-2 rounded-xl bg-white p-2 dark:bg-[#1C252E] ${
        fullWidthMobile ? 'inset-x-0 w-full' : 'right-0 w-[340px] lg:w-[365px]'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-2.5 pb-2 pt-1 dark:border-[#27323E]">
        <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
          درس‌ها و جلسات جادرسی
        </span>
        <span className="text-[11px] font-medium text-[#64748B] tabular-nums dark:text-[#94A3B8]">
          {groupedCoursesForMenu.length} درس · {lessons.length} جلسه
        </span>
      </div>
      <div className="mt-1.5 max-h-[55vh] space-y-1.5 overflow-y-auto px-0.5">
        {groupedCoursesForMenu.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
            هنوز درسی در جادرسی ثبت نشده است.
          </div>
        ) : (
          groupedCoursesForMenu.map((group) => {
            const groupKey = group.courseId ?? group.courseName;
            const isExpanded = expandedCourseKey === groupKey;
            const hasActiveLesson = Boolean(
              activeLesson && group.items.some((item) => item.id === activeLesson.id)
            );

            return (
              <div
                key={groupKey}
                className="overflow-hidden rounded-lg border border-[#E2E8F0]/80 bg-[#FAF9F6]/50 dark:border-[#27323E]/80 dark:bg-[#161D24]/45"
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() =>
                    setExpandedCourseKey((prev) => (prev === groupKey ? null : groupKey))
                  }
                  className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-right text-xs font-bold transition-colors ${
                    isExpanded
                      ? 'bg-[#F0FDFA]/70 text-[#0F766E] dark:bg-[#0F2928]/60 dark:text-[#2DD4BF]'
                      : 'text-[#334155] hover:bg-[#F8FAFC] dark:text-[#CBD5E1] dark:hover:bg-[#24303C]/80'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]" />
                    <span className="truncate">{group.courseName}</span>
                    {hasActiveLesson && !isExpanded && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0D9488] dark:bg-[#2DD4BF]"
                      />
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[10px] font-medium tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                      {group.items.length} جلسه
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-[#64748B] transition-transform duration-150 dark:text-[#94A3B8] ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-[#E2E8F0]/70 p-1.5 dark:border-[#27323E]/70">
                    {group.items.length === 0 ? (
                      <div className="rounded-md px-2.5 py-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        بدون جلسه — از مدیریت منابع جلسه اضافه کنید
                      </div>
                    ) : (
                      <ul className="space-y-0.5">
                        {group.items.map((lesson) => {
                          const isSelected = activeLesson?.id === lesson.id;
                          const mastery = lessonMasteryMap[lesson.id] ?? 0;
                          return (
                            <li key={lesson.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectLesson(lesson.id);
                                  setDropdownOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-right transition-colors ${
                                  isSelected
                                    ? 'bg-[#F0FDFA] text-[#0F766E] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                                    : 'text-[#1E293B] hover:bg-white dark:text-[#E2E8F0] dark:hover:bg-[#24303C]'
                                }`}
                              >
                                <span className="flex min-w-0 flex-1 items-center gap-2">
                                  <span
                                    aria-hidden="true"
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                      isSelected
                                        ? 'bg-[#0D9488] dark:bg-[#2DD4BF]'
                                        : 'bg-[#CBD5E1] dark:bg-[#475569]'
                                    }`}
                                  />
                                  <span className="truncate text-xs font-semibold sm:text-[13px]">
                                    {lesson.title}
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                  {mastery > 0 && (
                                    <span className="rounded bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-medium text-[#059669] tabular-nums dark:bg-[#064E3B]/40 dark:text-[#34D399]">
                                      {mastery}٪
                                    </span>
                                  )}
                                  {isSelected && (
                                    <Check className="h-3.5 w-3.5 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]" />
                                  )}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-[#E2E8F0] pt-2 dark:border-[#27323E]">
        <button
          type="button"
          onClick={() => {
            setDropdownOpen(false);
            onChangeMode('resources');
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#F0FDFA] px-3 py-2 text-xs font-semibold text-[#0F766E] transition-colors hover:bg-[#CCFBF1]/70 dark:bg-[#0F2928] dark:text-[#2DD4BF] dark:hover:bg-[#134E4A]/70"
        >
          <Library className="h-3.5 w-3.5" />
          <span>مدیریت درس‌ها و جلسات</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setDropdownOpen(false);
            onOpenImportModal();
          }}
          title="ورود گروهی فایل‌ها"
          className="flex items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-2 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1]"
        >
          <FileUp className="h-3.5 w-3.5" />
          <span>ورود سریع</span>
        </button>
      </div>
    </div>
  );

  if (headerCollapsed) {
    return (
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0]/80 bg-[#FAF9F6]/90 backdrop-blur-md transition-all duration-200 dark:border-[#27323E]/80 dark:bg-[#161D24]/90 no-print">
        <div className="mx-auto flex h-10 max-w-[1440px] items-center justify-between gap-2.5 px-4 md:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-extrabold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
              جادرسی
            </span>
            <span className="h-3.5 w-px shrink-0 bg-[#CBD5E1] dark:bg-[#364554]" aria-hidden="true" />
            {activeLesson && (
              <span className="min-w-0 truncate text-xs font-medium text-[#475569] dark:text-[#94A3B8]">
                {activeLesson.course} · جلسه {activeLesson.chapterNumber}: {activeLesson.title}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <StudyTimerWidget
              timer={studyTimer}
              activeLessonId={activeLesson?.id}
              activeLessonTitle={activeLesson?.title}
              activeLessonStudySeconds={activeLessonStudySeconds}
              liveReadingSnapshot={liveReadingSnapshot}
              savedCheckpoint={activeLessonCheckpoint}
              onSaveStudySession={onSaveStudySession}
              compact
            />

            <HoverTooltip label="جستجوی سریع (Ctrl+K)" placement="bottom" align="center">
              <button
                type="button"
                onClick={onOpenSearch}
                aria-label="جستجوی سریع"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </HoverTooltip>

            {isFullFocusMode && onExitFocusMode && (
              <HoverTooltip label="خروج از حالت تمرکز (Esc)" placement="bottom" align="end">
                <button
                  type="button"
                  onClick={onExitFocusMode}
                  aria-label="خروج از حالت تمرکز"
                  className="hidden h-7 w-7 items-center justify-center rounded-md border border-[#0D9488]/35 bg-[#F0FDFA] text-[#0F766E] transition-colors hover:border-[#0D9488] hover:bg-[#CCFBF1]/70 dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF] dark:hover:bg-[#134E4A]/70 sm:flex"
                >
                  <FocusTargetIcon className="h-4 w-4 shrink-0" />
                </button>
              </HoverTooltip>
            )}

            <HoverTooltip label="باز کردن نوار بالا" placement="bottom" align="end">
              <button
                type="button"
                onClick={onToggleHeaderCollapsed}
                aria-label="باز کردن نوار بالا"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[#0D9488]/35 bg-[#F0FDFA] text-[#0F766E] transition-colors hover:border-[#0D9488] hover:bg-[#CCFBF1]/70 dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF] dark:hover:bg-[#134E4A]/70"
              >
                <PanelTopOpen className="h-4 w-4 shrink-0" />
              </button>
            </HoverTooltip>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-[#FAF9F6]/95 backdrop-blur-sm transition-colors dark:border-[#27323E] dark:bg-[#161D24]/95 no-print">
      {/* ===================== MOBILE HEADER (< 768px) ===================== */}
      <div className="md:hidden">
        {/* Row 1: Right sidebar toggle + Left compact non-shrinking action icons */}
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex shrink-0 items-center gap-2">
            {workspaceMode === 'notes' && activeLesson && (
              <button
                type="button"
                onClick={onOpenMobileSyllabus}
                aria-label="باز کردن فهرست درس‌ها"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
              جادرسی
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <StudyTimerWidget
              timer={studyTimer}
              activeLessonId={activeLesson?.id}
              activeLessonTitle={activeLesson?.title}
              activeLessonStudySeconds={activeLessonStudySeconds}
              liveReadingSnapshot={liveReadingSnapshot}
              savedCheckpoint={activeLessonCheckpoint}
              onSaveStudySession={onSaveStudySession}
            />

            <button
              type="button"
              onClick={onOpenSearch}
              title="جستجو"
              aria-label="جستجوی سریع"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
            >
              <Search className="h-4 w-4" />
            </button>

            <HoverTooltip label="مدیریت منابع" placement="bottom" align="center">
              <button
                type="button"
                onClick={() => onChangeMode(workspaceMode === 'resources' ? 'notes' : 'resources')}
                aria-label="مدیریت منابع"
                aria-pressed={workspaceMode === 'resources'}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  workspaceMode === 'resources'
                    ? 'border-[#0D9488] bg-[#0D9488] text-white dark:border-[#14B8A6] dark:bg-[#0D9488]'
                    : 'border-[#0D9488]/40 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                }`}
              >
                <Library className="h-4 w-4" />
              </button>
            </HoverTooltip>

            {workspaceMode !== 'resources' && activeLesson && (
              <button
                type="button"
                onClick={handlePrint}
                title="چاپ یا ذخیره PDF"
                aria-label="چاپ یا ذخیره PDF"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
              >
                <FileDown className="h-4 w-4" />
              </button>
            )}

            <div className="relative shrink-0" ref={mobileThemeRef}>
              <button
                type="button"
                onClick={() => setThemeMenuOpen((v) => !v)}
                aria-expanded={themeMenuOpen}
                aria-haspopup="menu"
                title={themeTooltip}
                aria-label={themeTooltip}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
              >
                {renderThemeTriggerIcon()}
              </button>
              {themeMenuOpen && renderThemePopover()}
            </div>

            <HoverTooltip label="یادداشت‌ها" placement="bottom" align="center">
              <button
                type="button"
                onClick={onOpenDrawer}
                aria-label="یادداشت‌ها"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#E2E8F0]"
              >
                <StickyNote className="h-4 w-4" />
                {notesCount > 0 && (
                  <span className="absolute -left-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0D9488] px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                    {notesCount}
                  </span>
                )}
              </button>
            </HoverTooltip>

            <HoverTooltip label="کوچک‌سازی نوار بالا" placement="bottom" align="end">
              <button
                type="button"
                onClick={onToggleHeaderCollapsed}
                aria-label="کوچک‌سازی نوار بالا"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#94A3B8]"
              >
                <PanelTopClose className="h-4 w-4" />
              </button>
            </HoverTooltip>
          </div>
        </div>

        {/* Row 2: Full-width Lesson / Chapter Selector Dropdown */}
        <div className="border-t border-[#E2E8F0]/80 px-3 py-2 dark:border-[#27323E]">
          <div className="relative w-full min-w-0" ref={mobileDropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              aria-expanded={dropdownOpen}
              className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-right transition-colors hover:border-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 dark:border-[#27323E] dark:bg-[#1C252E] dark:hover:border-[#364554]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {activeLesson ? (
                  <>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E] tabular-nums dark:bg-[#0F2928] dark:text-[#2DD4BF]">
                      جلسه {activeLesson.chapterNumber} از {activeCourseSessionCount}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {activeLesson.title}
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                    هنوز جلسه‌ای ایجاد نشده — برای افزودن کلیک کنید
                  </span>
                )}
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#64748B] transition-transform duration-150 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {dropdownOpen && renderDropdownMenu(true)}
          </div>
        </div>

        {/* Row 3: Minimal 4-Tab Mode Switcher (Label only on active tab, icon-only + hover tooltip on inactive tabs) */}
        <div className="border-t border-[#E2E8F0]/80 px-3 py-1.5 dark:border-[#27323E]">
          <nav
            aria-label="تغییر حالت فضای مطالعه موبایل"
            className="flex items-center justify-center gap-1 rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#1E293B]"
          >
            {MODE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = workspaceMode === item.id;
              if (active) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeMode(item.id)}
                    aria-current="page"
                    className="flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#0D9488] shadow-xs transition-all duration-150 dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              }
              return (
                <HoverTooltip key={item.id} label={item.label} placement="bottom" align="center">
                  <button
                    type="button"
                    onClick={() => onChangeMode(item.id)}
                    aria-label={item.label}
                    className="flex h-8 w-11 items-center justify-center rounded-md border border-transparent text-[#64748B] transition-all duration-150 hover:bg-white/60 hover:text-[#1E293B] dark:text-[#94A3B8] dark:hover:bg-[#161D24]/60 dark:hover:text-[#F1F5F9]"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </button>
                </HoverTooltip>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ===================== DESKTOP / TABLET HEADER (>= 768px) ===================== */}
      <div className="mx-auto hidden max-w-[1440px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 md:flex lg:px-6 xl:h-[60px] xl:flex-nowrap xl:gap-x-3 xl:px-6 xl:py-0 2xl:px-10">
        {/* Right-aligned (RTL Start): Tablet Menu + Brand + Strictly Bounded Lesson Selector Dropdown */}
        <div className="flex min-w-0 flex-1 items-center gap-2 xl:max-w-[270px] 2xl:max-w-[330px]">
          {workspaceMode === 'notes' && activeLesson && (
            <button
              type="button"
              onClick={onOpenMobileSyllabus}
              aria-label="باز کردن فهرست درس‌ها"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}

          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-base font-extrabold tracking-tight text-[#0F172A] dark:text-[#F8FAFC]">
              جادرسی
            </span>
            <span className="h-4 w-px bg-[#CBD5E1] dark:bg-[#364554]" aria-hidden="true" />
          </div>

          <div
            className={`relative min-w-0 flex-1 ${dropdownOpen ? 'z-50' : 'z-10'}`}
            ref={desktopDropdownRef}
          >
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              aria-expanded={dropdownOpen}
              className="flex h-9 w-full min-w-0 items-center justify-between gap-1.5 overflow-hidden rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-right transition-all duration-150 hover:border-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 dark:border-[#27323E] dark:bg-[#1C252E] dark:hover:border-[#364554]"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                {activeLesson ? (
                  <>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-[#F0FDFA] px-1.5 py-0.5 text-[10px] font-semibold text-[#0F766E] tabular-nums dark:bg-[#0F2928] dark:text-[#2DD4BF] 2xl:px-2 2xl:text-[11px]">
                      جلسه {activeLesson.chapterNumber} از {activeCourseSessionCount}
                    </span>
                    <span
                      title={`${activeLesson.course} — ${activeLesson.title}`}
                      className="min-w-0 flex-1 truncate text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] 2xl:text-sm"
                    >
                      {activeLesson.title}
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                    بدون جلسه (ایجاد درس و جلسه)
                  </span>
                )}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[#64748B] transition-transform duration-150 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {dropdownOpen && renderDropdownMenu(false)}
          </div>
        </div>

        {/* Center-aligned: Minimal 4-Tab Switcher (Active tab shows label; inactive tabs are icon-only with hover tooltips) */}
        <nav
          aria-label="تغییر حالت فضای مطالعه"
          className="order-3 flex w-full shrink-0 justify-center border-t border-[#E2E8F0]/70 pt-2 dark:border-[#27323E] xl:order-none xl:w-auto xl:border-t-0 xl:pt-0"
        >
          <div className="inline-flex items-center gap-1 rounded-xl bg-[#E2E8F0] p-1 dark:bg-[#1E293B]">
            {MODE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = workspaceMode === item.id;
              if (active) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeMode(item.id)}
                    aria-current="page"
                    className="flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#0D9488] shadow-xs transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF] 2xl:px-3.5 2xl:text-sm"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              }
              return (
                <HoverTooltip key={item.id} label={item.label} placement="bottom" align="center">
                  <button
                    type="button"
                    onClick={() => onChangeMode(item.id)}
                    aria-label={item.label}
                    className="flex h-8 w-9 items-center justify-center rounded-lg border border-transparent text-[#64748B] transition-all duration-150 hover:bg-white/60 hover:text-[#1E293B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 dark:text-[#94A3B8] dark:hover:bg-[#161D24]/60 dark:hover:text-[#F1F5F9]"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </button>
                </HoverTooltip>
              );
            })}
          </div>
        </nav>

        {/* Left-aligned (RTL End): Reading Controls & Utilities */}
        <div className="flex shrink-0 items-center gap-1.5">
          <StudyTimerWidget
            timer={studyTimer}
            activeLessonId={activeLesson?.id}
            activeLessonTitle={activeLesson?.title}
            activeLessonStudySeconds={activeLessonStudySeconds}
            liveReadingSnapshot={liveReadingSnapshot}
            savedCheckpoint={activeLessonCheckpoint}
            onSaveStudySession={onSaveStudySession}
          />

          <HoverTooltip label="جستجوی سریع" placement="bottom" align="center">
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="جستجوی سریع در جادرسی (Ctrl+K)"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#64748B] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <kbd className="ltr-inline rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] text-[#475569] dark:bg-[#27323E] dark:text-[#CBD5E1]">
                Ctrl+K
              </kbd>
            </button>
          </HoverTooltip>

          {/* Font Scale A+ (right) / A- (left) */}
          <div
            className="flex shrink-0 items-center overflow-hidden rounded-lg border border-[#E2E8F0] bg-white dark:border-[#27323E] dark:bg-[#1C252E]"
            role="group"
            aria-label="تنظیم اندازه قلم"
          >
            <button
              type="button"
              onClick={() => onAdjustFontScale(1)}
              disabled={fontScale >= 3}
              title="بزرگ‌تر کردن قلم"
              className="ltr-inline flex h-9 w-7 items-center justify-center font-mono text-xs font-medium text-[#475569] transition-colors hover:bg-[#F4F5F7] hover:text-[#0F172A] disabled:opacity-35 dark:text-[#CBD5E1] dark:hover:bg-[#27323E] 2xl:w-8"
            >
              A+
            </button>
            <div className="h-4 w-px bg-[#E2E8F0] dark:bg-[#27323E]" />
            <button
              type="button"
              onClick={() => onAdjustFontScale(-1)}
              disabled={fontScale <= -2}
              title="کوچک‌تر کردن قلم"
              className="ltr-inline flex h-9 w-7 items-center justify-center font-mono text-xs font-medium text-[#475569] transition-colors hover:bg-[#F4F5F7] hover:text-[#0F172A] disabled:opacity-35 dark:text-[#CBD5E1] dark:hover:bg-[#27323E] 2xl:w-8"
            >
              A-
            </button>
          </div>

          <div className="relative shrink-0" ref={desktopThemeRef}>
            <button
              type="button"
              onClick={() => setThemeMenuOpen((v) => !v)}
              aria-expanded={themeMenuOpen}
              aria-haspopup="menu"
              title={themeTooltip}
              aria-label={themeTooltip}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]"
            >
              {renderThemeTriggerIcon()}
            </button>
            {themeMenuOpen && renderThemePopover()}
          </div>

          {workspaceMode !== 'resources' && activeLesson && (
            <button
              type="button"
              onClick={handlePrint}
              title="چاپ یا ذخیره PDF جزوه و آزمون"
              aria-label="چاپ یا ذخیره PDF"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]"
            >
              <FileDown className="h-4 w-4" />
            </button>
          )}

          <HoverTooltip label="مدیریت منابع" placement="bottom" align="center">
            <button
              type="button"
              onClick={() => onChangeMode(workspaceMode === 'resources' ? 'notes' : 'resources')}
              aria-pressed={workspaceMode === 'resources'}
              aria-label="مدیریت منابع"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                workspaceMode === 'resources'
                  ? 'border-[#0D9488] bg-[#0D9488] text-white hover:bg-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0D9488]'
                  : 'border-[#0D9488]/40 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] hover:bg-[#CCFBF1]/60 dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF] dark:hover:border-[#2DD4BF]'
              }`}
            >
              <Library className="h-4 w-4 shrink-0" />
            </button>
          </HoverTooltip>

          <HoverTooltip label="یادداشت‌ها" placement="bottom" align="center">
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="یادداشت‌ها"
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
            >
              <StickyNote className="h-4 w-4 shrink-0" />
              {notesCount > 0 && (
                <span className="absolute -left-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0D9488] px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                  {notesCount}
                </span>
              )}
            </button>
          </HoverTooltip>

          <HoverTooltip label="کوچک‌سازی نوار بالا" placement="bottom" align="end">
            <button
              type="button"
              onClick={onToggleHeaderCollapsed}
              aria-label="کوچک‌سازی مستقل نوار بالا"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC]"
            >
              <PanelTopClose className="h-4 w-4" />
            </button>
          </HoverTooltip>
        </div>
      </div>
    </header>
  );
};
