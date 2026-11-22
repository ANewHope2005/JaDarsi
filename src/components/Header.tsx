import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  FileDown,
  FileUp,
  FolderCog,
  FolderOpen,
  Layers,
  Menu,
  Monitor,
  Moon,
  Network,
  Search,
  Sun,
  CheckSquare,
  Check,
} from 'lucide-react';
import { Lesson, ThemePreference, WorkspaceMode } from '../types/study';

interface HeaderProps {
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
}

const MODE_ITEMS: { id: WorkspaceMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'notes', label: 'جزوه', icon: BookOpen },
  { id: 'mindmap', label: 'مایندمپ', icon: Network },
  { id: 'flashcards', label: 'فلش‌کارت', icon: Layers },
  { id: 'quiz', label: 'آزمون تستی', icon: CheckSquare },
];

export const Header: React.FC<HeaderProps> = ({
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
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

  const handlePrint = () => {
    window.print();
  };

  const themeTooltip =
    themePreference === 'system'
      ? `پوسته: خودکار سیستم (اکنون ${systemPrefersDark ? 'شب' : 'روز'})`
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
      icon: React.ComponentType<{ className?: string }>;
    }[] = [
      {
        id: 'system',
        label: 'خودکار (سیستم)',
        hint: systemPrefersDark ? 'اکنون: شب' : 'اکنون: روز',
        icon: Monitor,
      },
      {
        id: 'light',
        label: 'حالت روز',
        hint: 'کاغذ آرشیوی',
        icon: Sun,
      },
      {
        id: 'dark',
        label: 'حالت شب',
        hint: 'مطالعه در تاریکی',
        icon: Moon,
      },
    ];

    return (
      <div
        role="menu"
        aria-label="انتخاب پوسته ظاهری"
        className="elevation-tier-3 absolute left-0 z-50 mt-2 w-48 rounded-xl bg-white p-1.5 dark:bg-[#1C252E]"
      >
        <div className="border-b border-[#E2E8F0] px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-[#64748B] dark:border-[#27323E] dark:text-[#94A3B8]">
          پوسته نمایش
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
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
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

  const renderDropdownMenu = (fullWidthMobile: boolean) => (
    <div
      className={`elevation-tier-3 absolute z-40 mt-2 rounded-xl bg-white p-2 dark:bg-[#1C252E] ${
        fullWidthMobile ? 'inset-x-0 w-full' : 'right-0 w-[340px] lg:w-[360px]'
      }`}
    >
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-2.5 pb-2 pt-1 dark:border-[#27323E]">
        <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
          سرفصل‌های جادرسی
        </span>
        <span className="ltr-inline font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
          {lessons.length} Modules
        </span>
      </div>
      <ul className="mt-1.5 max-h-[55vh] space-y-1 overflow-y-auto">
        {lessons.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
            هنوز درسی در جادرسی ثبت نشده است.
          </li>
        ) : (
          lessons.map((lesson) => {
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
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-right transition-colors ${
                    isSelected
                      ? 'bg-[#F0FDFA] text-[#0F766E] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                      : 'text-[#1E293B] hover:bg-[#F8FAFC] dark:text-[#E2E8F0] dark:hover:bg-[#24303C]'
                  }`}
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#E2E8F0] bg-white font-mono text-xs font-semibold text-[#334155] tabular-nums dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1]">
                    {lesson.chapterNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{lesson.title}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-[#0D9488]" />}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                      <span className="ltr-inline font-mono text-[11px]">{lesson.code}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{lesson.course}</span>
                      {mastery > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0 font-medium text-[#059669] tabular-nums dark:text-[#34D399]">
                            تسلط {mastery}٪
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="mt-2 flex items-center gap-1.5 border-t border-[#E2E8F0] pt-2 dark:border-[#27323E]">
        <button
          type="button"
          onClick={() => {
            setDropdownOpen(false);
            onChangeMode('resources');
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#F0FDFA] px-3 py-2 text-xs font-semibold text-[#0F766E] transition-colors hover:bg-[#CCFBF1]/70 dark:bg-[#0F2928] dark:text-[#2DD4BF] dark:hover:bg-[#134E4A]/70"
        >
          <FolderCog className="h-3.5 w-3.5" />
          <span>مدیریت منابع و درس‌ها</span>
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
            <button
              type="button"
              onClick={onOpenSearch}
              title="جستجو"
              aria-label="جستجوی سریع"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
            >
              <Search className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onChangeMode(workspaceMode === 'resources' ? 'notes' : 'resources')}
              title="مدیریت منابع و درس‌ها"
              aria-label="مدیریت منابع و درس‌ها"
              aria-pressed={workspaceMode === 'resources'}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                workspaceMode === 'resources'
                  ? 'border-[#0D9488] bg-[#0D9488] text-white dark:border-[#14B8A6] dark:bg-[#0D9488]'
                  : 'border-[#0D9488]/40 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
              }`}
            >
              <FolderCog className="h-4 w-4" />
            </button>

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

            <button
              type="button"
              onClick={onOpenDrawer}
              title="یادداشت‌ها"
              aria-label="دفترچه یادداشت‌ها"
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#E2E8F0]"
            >
              <FolderOpen className="h-4 w-4" />
              {notesCount > 0 && (
                <span className="absolute -left-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0D9488] px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                  {notesCount}
                </span>
              )}
            </button>
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
                      فصل {activeLesson.chapterNumber} از {lessons.length}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                      {activeLesson.title}
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                    هنوز درسی ایجاد نشده — برای افزودن کلیک کنید
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

        {/* Row 3: 4 Evenly Spaced Main Mode Tabs */}
        <div className="border-t border-[#E2E8F0]/80 px-3 py-1.5 dark:border-[#27323E]">
          <nav
            aria-label="تغییر حالت فضای مطالعه موبایل"
            className="grid grid-cols-4 gap-1 rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#1E293B]"
          >
            {MODE_ITEMS.map((item) => {
              const active = workspaceMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeMode(item.id)}
                  className={`truncate whitespace-nowrap rounded-md px-1 py-1.5 text-center text-xs transition-colors ${
                    active
                      ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                      : 'font-medium text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ===================== DESKTOP / TABLET HEADER (>= 768px) ===================== */}
      <div className="mx-auto hidden max-w-[1440px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-2.5 md:flex lg:px-8 xl:h-[60px] xl:flex-nowrap xl:px-10 xl:py-0">
        {/* Right-aligned (RTL Start): Tablet Menu + Brand + Lesson Selector Dropdown */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 xl:flex-initial">
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

          <div className="relative min-w-0 max-w-full flex-1 xl:flex-initial" ref={desktopDropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              aria-expanded={dropdownOpen}
              className="flex h-10 w-full max-w-[320px] min-w-0 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-right transition-all duration-150 hover:border-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 dark:border-[#27323E] dark:bg-[#1C252E] dark:hover:border-[#364554] xl:w-auto xl:max-w-[235px] 2xl:max-w-[285px]"
            >
              {activeLesson ? (
                <>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E] tabular-nums dark:bg-[#0F2928] dark:text-[#2DD4BF]">
                    فصل {activeLesson.chapterNumber} از {lessons.length}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                    {activeLesson.title}
                  </span>
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                  بدون درس (ایجاد درس جدید)
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[#64748B] transition-transform duration-150 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {dropdownOpen && renderDropdownMenu(false)}
          </div>
        </div>

        {/* Center-aligned: Segmented Workspace Mode Switcher (drops cleanly to row 2 on tablet 768px-1279px) */}
        <nav
          aria-label="تغییر حالت فضای مطالعه"
          className="order-3 flex w-full shrink-0 justify-center border-t border-[#E2E8F0]/70 pt-2 dark:border-[#27323E] xl:order-none xl:w-auto xl:border-t-0 xl:pt-0"
        >
          <div className="grid w-full max-w-[480px] grid-cols-4 items-center gap-1 rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#1E293B] xl:flex xl:w-auto xl:max-w-none xl:gap-0">
            {MODE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = workspaceMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeMode(item.id)}
                  className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 xl:min-w-[92px] ${
                    active
                      ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] shadow-xs dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                      : 'border border-transparent font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Left-aligned (RTL End): Reading Controls & Utilities */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSearch}
            title="جستجوی سریع در جادرسی (Ctrl+K)"
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs text-[#64748B] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden 2xl:inline">جستجو</span>
            <kbd className="ltr-inline hidden rounded bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] text-[#475569] dark:bg-[#27323E] dark:text-[#CBD5E1] 2xl:inline">
              Ctrl+K
            </kbd>
          </button>

          {/* Font Scale A- / A+ */}
          <div
            className="flex shrink-0 items-center overflow-hidden rounded-lg border border-[#E2E8F0] bg-white dark:border-[#27323E] dark:bg-[#1C252E]"
            role="group"
            aria-label="تنظیم اندازه قلم"
          >
            <button
              type="button"
              onClick={() => onAdjustFontScale(-1)}
              disabled={fontScale <= -2}
              title="کوچک‌تر کردن قلم"
              className="ltr-inline flex h-9 w-8 items-center justify-center font-mono text-xs font-medium text-[#475569] transition-colors hover:bg-[#F4F5F7] hover:text-[#0F172A] disabled:opacity-35 dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
            >
              A-
            </button>
            <div className="h-4 w-px bg-[#E2E8F0] dark:bg-[#27323E]" />
            <button
              type="button"
              onClick={() => onAdjustFontScale(1)}
              disabled={fontScale >= 3}
              title="بزرگ‌تر کردن قلم"
              className="ltr-inline flex h-9 w-8 items-center justify-center font-mono text-xs font-medium text-[#475569] transition-colors hover:bg-[#F4F5F7] hover:text-[#0F172A] disabled:opacity-35 dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
            >
              A+
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

          <button
            type="button"
            onClick={() => onChangeMode(workspaceMode === 'resources' ? 'notes' : 'resources')}
            aria-pressed={workspaceMode === 'resources'}
            title="مدیریت منابع و درس‌ها"
            className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
              workspaceMode === 'resources'
                ? 'border-[#0D9488] bg-[#0D9488] text-white hover:bg-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0D9488]'
                : 'border-[#0D9488]/40 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] hover:bg-[#CCFBF1]/60 dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF] dark:hover:border-[#2DD4BF]'
            }`}
          >
            <FolderCog className="h-3.5 w-3.5 shrink-0" />
            <span>مدیریت منابع</span>
          </button>

          <button
            type="button"
            onClick={onOpenDrawer}
            title="دفترچه یادداشت‌ها و فایل‌ها"
            className="relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
          >
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="hidden 2xl:inline">یادداشت‌ها</span>
            {notesCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0D9488] px-1 font-mono text-[10px] font-semibold text-white tabular-nums">
                {notesCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
