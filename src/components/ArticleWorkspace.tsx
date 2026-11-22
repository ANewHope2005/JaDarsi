import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  CheckSquare,
  Lightbulb,
  FlaskConical,
  Sigma,
  StickyNote,
  X,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  Highlighter,
  Trash2,
  RotateCcw,
  FileUp,
} from 'lucide-react';
import {
  ArticleCallout,
  HighlightAnchor,
  HighlightColor,
  Lesson,
  TextHighlight,
  UserNote,
  WorkspaceMode,
} from '../types/study';
import {
  FormulaDisplay,
  HighlightContext,
  MarkdownContent,
  normalizeFormulaKey,
  RichMathText,
  SectionScopeContext,
} from '../utils/latexText';

export interface NewHighlightPayload {
  text: string;
  anchors: HighlightAnchor[];
  color: HighlightColor;
  sectionId?: string;
}

interface ArticleWorkspaceProps {
  lessons: Lesson[];
  activeLesson: Lesson;
  onSelectLesson: (lessonId: string) => void;
  onChangeMode: (mode: WorkspaceMode) => void;
  fontScale: number;
  bookmarkedSections: string[];
  onToggleBookmark: (sectionKey: string) => void;
  lessonNotes: UserNote[];
  onQuickAddNote: (sectionId?: string) => void;
  focusSectionId: string | null;
  onClearFocusSection: () => void;
  mobileSyllabusOpen: boolean;
  onCloseMobileSyllabus: () => void;
  lessonMasteryMap: Record<string, number>;
  rightSidebarOpen: boolean;
  leftSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  onToggleLeftSidebar: () => void;
  onToggleFocusMode: () => void;
  lessonHighlights: TextHighlight[];
  onAddHighlight: (payload: NewHighlightPayload) => void;
  onRemoveHighlight: (highlightId: string) => void;
  onRestoreHighlight: (highlight: TextHighlight) => void;
  onUpdateHighlightColor: (highlightId: string, color: HighlightColor) => void;
  onClearLessonHighlights: () => void;
  onOpenImportModal?: () => void;
}

const CALLOUT_STYLES: Record<
  ArticleCallout['variant'],
  {
    wrapper: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  important: {
    wrapper:
      'border border-[#99F6E4]/70 border-r-4 border-r-[#0D9488] bg-[#F0FDFA] dark:border-[#134E4A] dark:border-r-[#14B8A6] dark:bg-[#0F2928]/70',
    label: 'text-[#0F766E] dark:text-[#2DD4BF]',
    icon: Lightbulb,
  },
  example: {
    wrapper:
      'border border-[#E2E8F0] border-r-4 border-r-[#475569] bg-[#F8FAFC] dark:border-[#27323E] dark:border-r-[#64748B] dark:bg-[#1C252E]',
    label: 'text-[#334155] dark:text-[#CBD5E1]',
    icon: FlaskConical,
  },
  formula: {
    wrapper:
      'border border-[#99F6E4]/70 border-r-4 border-r-[#0D9488] bg-[#F0FDFA] dark:border-[#134E4A] dark:border-r-[#14B8A6] dark:bg-[#0F2928]/70',
    label: 'text-[#0F766E] dark:text-[#2DD4BF]',
    icon: Sigma,
  },
};

const HIGHLIGHT_SWATCHES: {
  color: HighlightColor;
  label: string;
  swatchBg: string;
  ringColor: string;
}[] = [
  { color: 'yellow', label: 'زرد', swatchBg: 'bg-[#FEF08A]', ringColor: 'border-[#CA8A04]' },
  { color: 'amber', label: 'کهربایی', swatchBg: 'bg-[#FDE68A]', ringColor: 'border-[#D97706]' },
  { color: 'green', label: 'سبز', swatchBg: 'bg-[#A7F3D0]', ringColor: 'border-[#059669]' },
  { color: 'blue', label: 'آبی', swatchBg: 'bg-[#BAE6FD]', ringColor: 'border-[#0284C7]' },
];

interface SelectionPopoverState {
  displayText: string;
  anchors: HighlightAnchor[];
  hasFormula: boolean;
  sectionId?: string;
  x: number;
  y: number;
}

/**
 * Checks whether a DOM Range genuinely overlaps an atomic formula element
 * (excluding zero-width touches right at the formula's outer boundary).
 */
function doesRangeOverlapFormula(range: Range, formulaEl: HTMLElement): boolean {
  if (!range.intersectsNode(formulaEl)) return false;

  if (formulaEl.contains(range.startContainer) && formulaEl.contains(range.endContainer)) {
    return true;
  }

  const parent = formulaEl.parentNode;
  if (parent) {
    const idx = Array.prototype.indexOf.call(parent.childNodes, formulaEl);
    if (range.startContainer === parent && range.startOffset === idx + 1) return false;
    if (range.endContainer === parent && range.endOffset === idx) return false;
  }

  if (
    !formulaEl.contains(range.startContainer) &&
    formulaEl.contains(range.endContainer) &&
    range.endOffset === 0
  ) {
    const probe = document.createRange();
    probe.setStart(formulaEl, 0);
    probe.setEnd(range.endContainer, range.endOffset);
    if ((probe.toString() || '').trim().length === 0) return false;
  }

  if (formulaEl.contains(range.startContainer) && !formulaEl.contains(range.endContainer)) {
    const probe = document.createRange();
    probe.setStart(range.startContainer, range.startOffset);
    probe.setEnd(formulaEl, formulaEl.childNodes.length);
    if ((probe.toString() || '').trim().length === 0) return false;
  }

  return true;
}

function getElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) return null;
  return node instanceof HTMLElement ? node : node.parentElement;
}

function formatFormulaForSnippet(raw: string): string {
  const cleaned = normalizeFormulaKey(raw);
  if (/^\$[\s\S]*\$$/.test(cleaned)) return cleaned;
  return `$${cleaned}$`;
}

/**
 * Extracts atomic formula anchors + clean prose anchors from any user selection
 * Range without calling Range.surroundContents() across element boundaries.
 */
function extractSelectionHighlight(
  range: Range,
  container: HTMLElement
): { displayText: string; anchors: HighlightAnchor[]; hasFormula: boolean } | null {
  const anchors: HighlightAnchor[] = [];
  const seenFormulaKeys = new Set<string>();
  const seenTextKeys = new Set<string>();

  // 1. Collect every atomic formula container overlapped by the selection Range
  const formulaEls = container.querySelectorAll<HTMLElement>('[data-formula-atomic="true"]');
  formulaEls.forEach((el) => {
    if (el.closest('pre, code, button')) return;
    if (!doesRangeOverlapFormula(range, el)) return;
    const raw = el.getAttribute('data-formula-raw');
    if (!raw) return;
    const key = normalizeFormulaKey(raw);
    if (key && !seenFormulaKeys.has(key)) {
      seenFormulaKeys.add(key);
      anchors.push({ kind: 'formula', value: key });
    }
  });

  // 2. Clamp a cloned range outside any partially-entered atomic formula so
  // KaTeX/MathML internal characters never leak into prose text anchors
  const startEl = getElementFromNode(range.startContainer);
  const endEl = getElementFromNode(range.endContainer);
  const startFormula = startEl?.closest<HTMLElement>('[data-formula-atomic="true"]') ?? null;
  const endFormula = endEl?.closest<HTMLElement>('[data-formula-atomic="true"]') ?? null;

  const isPureSingleFormula = Boolean(startFormula && startFormula === endFormula);
  const snippetParts: string[] = [];

  if (!isPureSingleFormula) {
    const proseRange = range.cloneRange();
    try {
      if (startFormula) proseRange.setStartAfter(startFormula);
      if (endFormula) proseRange.setEndBefore(endFormula);
    } catch {
      // Keep original proseRange if boundary adjustment fails
    }

    if (!proseRange.collapsed) {
      const fragment = proseRange.cloneContents();

      // Build clean human-readable snippet preserving formula order
      const snippetWrapper = document.createElement('div');
      snippetWrapper.appendChild(fragment.cloneNode(true));
      snippetWrapper.querySelectorAll('pre, code, button, .katex-mathml').forEach((el) => {
        el.remove();
      });
      snippetWrapper.querySelectorAll<HTMLElement>('[data-formula-atomic="true"]').forEach((el) => {
        const raw = el.getAttribute('data-formula-raw') ?? '';
        el.replaceWith(document.createTextNode(` ${formatFormulaForSnippet(raw)} `));
      });
      const readableProse = (snippetWrapper.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (readableProse) snippetParts.push(readableProse);

      // Extract pure prose segments excluding atomic formulas, KaTeX, code, and buttons
      const textWrapper = document.createElement('div');
      textWrapper.appendChild(fragment);
      textWrapper
        .querySelectorAll('[data-formula-atomic="true"], .katex, .katex-mathml, pre, code, button')
        .forEach((el) => {
          el.replaceWith(document.createTextNode('\n'));
        });

      const rawText = textWrapper.textContent ?? '';
      rawText
        .split(/\n+/)
        .map((seg) => seg.replace(/\s+/g, ' ').trim())
        .filter((seg) => seg.length >= 2 && seg.length <= 400)
        .forEach((seg) => {
          if (!seenTextKeys.has(seg)) {
            seenTextKeys.add(seg);
            anchors.push({ kind: 'text', value: seg });
          }
        });
    }
  }

  if (anchors.length === 0) return null;

  // Build final display snippet for sidebar / toast
  let displayText = '';
  if (isPureSingleFormula && startFormula) {
    const raw = startFormula.getAttribute('data-formula-raw') ?? '';
    displayText = formatFormulaForSnippet(raw);
  } else {
    const prefix = startFormula
      ? formatFormulaForSnippet(startFormula.getAttribute('data-formula-raw') ?? '')
      : '';
    const suffix =
      endFormula && endFormula !== startFormula
        ? formatFormulaForSnippet(endFormula.getAttribute('data-formula-raw') ?? '')
        : '';
    displayText = [prefix, ...snippetParts, suffix]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (!displayText) {
    displayText = anchors
      .map((a) => (a.kind === 'formula' ? formatFormulaForSnippet(a.value) : a.value))
      .join(' · ');
  }

  if (displayText.length > 160) {
    displayText = `${displayText.slice(0, 157).trim()}...`;
  }

  return {
    displayText,
    anchors,
    hasFormula: seenFormulaKeys.size > 0,
  };
}

function findEnclosingSectionId(node: Node | null): string | undefined {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement) {
      if (cur.dataset.sectionId) return cur.dataset.sectionId;
      if (cur.tagName === 'SECTION' && cur.id) return cur.id;
    }
    cur = cur.parentNode;
  }
  return undefined;
}

export const ArticleWorkspace: React.FC<ArticleWorkspaceProps> = ({
  lessons,
  activeLesson,
  onSelectLesson,
  onChangeMode,
  fontScale,
  bookmarkedSections,
  onToggleBookmark,
  lessonNotes,
  onQuickAddNote,
  focusSectionId,
  onClearFocusSection,
  mobileSyllabusOpen,
  onCloseMobileSyllabus,
  lessonMasteryMap,
  rightSidebarOpen,
  leftSidebarOpen,
  onToggleRightSidebar,
  onToggleLeftSidebar,
  onToggleFocusMode,
  lessonHighlights,
  onAddHighlight,
  onRemoveHighlight,
  onRestoreHighlight,
  onUpdateHighlightColor,
  onClearLessonHighlights,
  onOpenImportModal,
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string>(activeLesson.sections[0]?.id ?? '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectionPopover, setSelectionPopover] = useState<SelectionPopoverState | null>(null);
  const [removedToast, setRemovedToast] = useState<TextHighlight | null>(null);

  const readingBodyRef = useRef<HTMLDivElement>(null);
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveSectionId(activeLesson.sections[0]?.id ?? '');
    setSelectionPopover(null);
    setRemovedToast(null);
  }, [activeLesson.id, activeLesson.sections]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // Smooth jump when redirected from Mindmap, Search, or Flashcards
  useEffect(() => {
    if (!focusSectionId) return;
    const el = document.getElementById(focusSectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(focusSectionId);
    }
    onClearFocusSection();
  }, [focusSectionId, onClearFocusSection]);

  // Track visible section for Table of Contents
  useEffect(() => {
    const sections = activeLesson.sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveSectionId(visible[0].target.id);
        }
      },
      { rootMargin: '-90px 0px -60% 0px', threshold: 0.1 }
    );

    sections.forEach((sec) => observer.observe(sec));
    return () => observer.disconnect();
  }, [activeLesson]);

  // Dismiss selection popover on Escape or scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectionPopover(null);
      }
    };
    const onScroll = () => {
      setSelectionPopover(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  const handleReadingSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelectionPopover(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const container = readingBodyRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelectionPopover(null);
      return;
    }

    // Ignore selections purely inside code blocks or UI buttons (allow KaTeX formulas!)
    const startEl = getElementFromNode(range.startContainer);
    const endEl = getElementFromNode(range.endContainer);
    if (startEl?.closest('pre, code, button') && endEl?.closest('pre, code, button')) {
      setSelectionPopover(null);
      return;
    }

    const extracted = extractSelectionHighlight(range, container);
    if (!extracted || extracted.anchors.length === 0) {
      setSelectionPopover(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const startSection = findEnclosingSectionId(range.startContainer);
    const endSection = findEnclosingSectionId(range.endContainer);
    const scopedSectionId =
      startSection && startSection === endSection ? startSection : undefined;

    const clampedX = Math.max(130, Math.min(window.innerWidth - 130, rect.left + rect.width / 2));
    const clampedY = Math.max(76, rect.top - 10);

    setSelectionPopover({
      displayText: extracted.displayText,
      anchors: extracted.anchors,
      hasFormula: extracted.hasFormula,
      sectionId: scopedSectionId,
      x: clampedX,
      y: clampedY,
    });
  }, []);

  const handleApplyHighlightColor = (color: HighlightColor) => {
    if (!selectionPopover) return;
    onAddHighlight({
      text: selectionPopover.displayText,
      anchors: selectionPopover.anchors,
      color,
      sectionId: selectionPopover.sectionId,
    });
    setSelectionPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  // Clicking any existing highlight (plain text OR atomic formula) cleanly removes it
  // without altering the underlying formula DOM, offering a brief Undo toast.
  const handleClickExistingHighlight = useCallback(
    (highlight: TextHighlight) => {
      setSelectionPopover(null);
      onRemoveHighlight(highlight.id);
      setRemovedToast(highlight);
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
      undoTimerRef.current = window.setTimeout(() => {
        setRemovedToast(null);
        undoTimerRef.current = null;
      }, 4200);
    },
    [onRemoveHighlight]
  );

  const handleUndoRemoveHighlight = () => {
    if (!removedToast) return;
    onRestoreHighlight(removedToast);
    setRemovedToast(null);
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const highlightCtxValue = useMemo(
    () => ({
      highlights: lessonHighlights,
      onClickHighlight: handleClickExistingHighlight,
    }),
    [lessonHighlights, handleClickExistingHighlight]
  );

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Fallback ignored cleanly
    }
  };

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSectionId(sectionId);
    }
  };

  const currentIdx = lessons.findIndex((l) => l.id === activeLesson.id);
  const prevLesson = currentIdx > 0 ? lessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < lessons.length - 1 ? lessons[currentIdx + 1] : null;

  const baseFontPx = 16 + fontScale * 1.5;
  const bothCollapsed = !rightSidebarOpen && !leftSidebarOpen;

  const desktopGridClass =
    rightSidebarOpen && leftSidebarOpen
      ? 'lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,760px)_250px] xl:justify-between'
      : rightSidebarOpen && !leftSidebarOpen
      ? 'lg:grid-cols-[270px_minmax(0,1fr)]'
      : !rightSidebarOpen && leftSidebarOpen
      ? 'lg:grid-cols-[minmax(0,1fr)_250px]'
      : 'grid-cols-1';

  const readingSheetWidthClass = bothCollapsed
    ? 'max-w-[980px]'
    : !rightSidebarOpen || !leftSidebarOpen
    ? 'max-w-[900px]'
    : 'max-w-[760px]';

  const syllabusContent = (
    <div className="space-y-5">
      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
              سرفصل درس‌ها
            </h2>
            <span className="font-mono text-[11px] text-[#64748B] tabular-nums dark:text-[#94A3B8]">
              ({lessons.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleRightSidebar}
            title="بستن ستون سرفصل درس‌ها"
            aria-label="بستن ستون سرفصل درس‌ها"
            className="hidden h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC] lg:flex"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="ناوبری سرفصل‌ها" className="space-y-1.5">
          {lessons.map((lesson) => {
            const isCurrent = lesson.id === activeLesson.id;
            const mastery = lessonMasteryMap[lesson.id] ?? 0;
            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => {
                  onSelectLesson(lesson.id);
                  onCloseMobileSyllabus();
                }}
                className={`group flex w-full flex-col rounded-lg border px-3.5 py-3 text-right transition-all duration-150 ${
                  isCurrent
                    ? 'border-[#0D9488]/40 bg-[#FAF9F6] shadow-xs dark:border-[#14B8A6]/40 dark:bg-[#161D24]'
                    : 'border-transparent bg-transparent hover:border-[#E2E8F0] hover:bg-white/70 dark:hover:border-[#27323E] dark:hover:bg-[#1C252E]/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="ltr-inline font-mono text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    {lesson.code}
                  </span>
                  <span className="text-[11px] text-[#64748B] tabular-nums dark:text-[#94A3B8]">
                    فصل {lesson.chapterNumber}
                  </span>
                </div>
                <span
                  className={`mt-1 text-sm font-semibold leading-6 ${
                    isCurrent
                      ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                      : 'text-[#1E293B] group-hover:text-[#0F172A] dark:text-[#E2E8F0]'
                  }`}
                >
                  {lesson.title}
                </span>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  <span>{lesson.readingMinutes} دقیقه</span>
                  {mastery > 0 && (
                    <span className="font-medium text-[#059669] tabular-nums dark:text-[#34D399]">
                      تسلط {mastery}٪
                    </span>
                  )}
                </div>
                {mastery > 0 && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#27323E]">
                    <div
                      className="h-full rounded-full bg-[#0D9488] transition-all duration-300"
                      style={{ width: `${mastery}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
        <button
          type="button"
          onClick={() => {
            onQuickAddNote(activeSectionId);
            onCloseMobileSyllabus();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1E293B] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
        >
          <StickyNote className="h-3.5 w-3.5" />
          <span>ثبت حاشیه‌نویسی برای این فصل</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-6 lg:px-10 lg:py-8">
      {/* Floating Selection Highlighter Popover */}
      {selectionPopover && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            left: `${selectionPopover.x}px`,
            top: `${selectionPopover.y}px`,
          }}
          className="elevation-tier-3 fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-xl bg-white px-3 py-2 dark:bg-[#1C252E] no-print"
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1]">
            <Highlighter className="h-3.5 w-3.5 text-[#0D9488]" />
            <span>{selectionPopover.hasFormula ? 'هایلایت متن/فرمول:' : 'هایلایت:'}</span>
          </span>
          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_SWATCHES.map((sw) => (
              <button
                key={sw.color}
                type="button"
                onClick={() => handleApplyHighlightColor(sw.color)}
                title={`هایلایت ${sw.label}`}
                aria-label={`هایلایت با رنگ ${sw.label}`}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${sw.swatchBg} ${sw.ringColor}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Subtle Undo Toast when an existing highlight is removed on click */}
      {removedToast && (
        <div className="elevation-tier-3 fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#0F172A] px-4 py-2.5 text-xs text-white shadow-lg dark:border-[#364554] dark:bg-[#1C252E] no-print">
          <span>هایلایت حذف شد</span>
          <button
            type="button"
            onClick={handleUndoRemoveHighlight}
            className="flex items-center gap-1 rounded-md bg-[#0D9488] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#0F766E]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>بازگردانی</span>
          </button>
          <button
            type="button"
            onClick={() => setRemovedToast(null)}
            aria-label="بستن اعلان"
            className="rounded p-0.5 text-[#94A3B8] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Mobile Syllabus Slide-Over */}
      {mobileSyllabusOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[1px]"
            onClick={onCloseMobileSyllabus}
          />
          <div className="relative z-10 flex h-full w-[300px] max-w-[85vw] flex-col bg-[#F4F5F7] p-5 shadow-2xl dark:bg-[#0F1419]">
            <div className="mb-4 flex items-center justify-between border-b border-[#E2E8F0] pb-3 dark:border-[#27323E]">
              <span className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                سرفصل‌های جادرسی
              </span>
              <button
                type="button"
                onClick={onCloseMobileSyllabus}
                aria-label="بستن فهرست"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#64748B] hover:bg-white dark:hover:bg-[#1C252E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{syllabusContent}</div>
          </div>
        </div>
      )}

      {/* Adaptive Academic Grid with Collapsible Sidebars */}
      <div className={`grid grid-cols-1 items-start gap-6 transition-all duration-200 ${desktopGridClass}`}>
        {/* Right-Pinned Contextual Syllabus Rail (RTL First Column) */}
        {rightSidebarOpen && (
          <aside className="sticky top-[84px] hidden max-h-[calc(100vh-110px)] overflow-y-auto pl-2 transition-opacity duration-200 lg:block">
            {syllabusContent}
          </aside>
        )}

        {/* Focal Archival Reading Sheet */}
        <main
          className={`elevation-tier-1 mx-auto w-full rounded-2xl bg-[#FAF9F6] px-6 py-7 transition-[max-width] duration-200 dark:bg-[#161D24] sm:px-10 sm:py-10 ${readingSheetWidthClass}`}
        >
          {/* Reader Layout & Highlight Controls Toolbar */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0]/70 pb-3 dark:border-[#27323E] no-print">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleRightSidebar}
                className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors lg:flex ${
                  rightSidebarOpen
                    ? 'border-transparent text-[#64748B] hover:border-[#E2E8F0] hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]'
                    : 'border-[#0D9488]/30 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] dark:border-[#14B8A6]/35 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                }`}
              >
                {rightSidebarOpen ? (
                  <PanelRightClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelRightOpen className="h-3.5 w-3.5" />
                )}
                <span>{rightSidebarOpen ? 'بستن سرفصل درس‌ها' : 'نمایش سرفصل درس‌ها'}</span>
              </button>

              <span className="flex items-center gap-1.5 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                <Highlighter className="h-3.5 w-3.5 text-[#D97706]" />
                <span>متن یا فرمول را انتخاب کنید تا هایلایت شود (کلیک برای حذف)</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {lessonHighlights.length > 0 && (
                <button
                  type="button"
                  onClick={onClearLessonHighlights}
                  title="پاک کردن تمام هایلایت‌های این فصل"
                  className="flex items-center gap-1.5 rounded-lg border border-[#FCD34D]/80 bg-[#FFFBEB] px-2.5 py-1.5 text-xs font-medium text-[#B45309] transition-colors hover:bg-[#FEF3C7] dark:border-[#B45309]/60 dark:bg-[#451A03]/40 dark:text-[#FBBF24]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="tabular-nums">پاک‌سازی هایلایت‌ها ({lessonHighlights.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={onToggleFocusMode}
                title={bothCollapsed ? 'بازگرداندن ستون‌های کناری' : 'نمای مطالعه تمام‌عرض بدون حواس‌پرتی'}
                className="hidden items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-[#64748B] transition-colors hover:border-[#E2E8F0] hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC] lg:flex"
              >
                {bothCollapsed ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5 text-[#0D9488]" />
                    <span>نمایش ستون‌ها</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>حالت تمرکز</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onToggleLeftSidebar}
                className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors lg:flex ${
                  leftSidebarOpen
                    ? 'border-transparent text-[#64748B] hover:border-[#E2E8F0] hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]'
                    : 'border-[#0D9488]/30 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] dark:border-[#14B8A6]/35 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                }`}
              >
                <span>{leftSidebarOpen ? 'بستن فهرست مطالب' : 'نمایش فهرست مطالب'}</span>
                {leftSidebarOpen ? (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Highlight-enabled Reading Body */}
          <HighlightContext.Provider value={highlightCtxValue}>
            <div
              ref={readingBodyRef}
              onMouseUp={handleReadingSelection}
              onTouchEnd={handleReadingSelection}
            >
              {/* Document Header */}
              <SectionScopeContext.Provider value="__header__">
                <header
                  data-section-id="__header__"
                  className="border-b border-[#E2E8F0] pb-7 dark:border-[#27323E]"
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                    <span className="ltr-inline font-mono font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                      {activeLesson.code}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeLesson.course}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{activeLesson.readingMinutes} دقیقه مطالعه</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeLesson.lastUpdated}</span>
                  </div>

                  <h1 className="mt-3 text-2xl font-bold leading-[1.45] tracking-tight text-[#0F172A] dark:text-[#F8FAFC] sm:text-[2.1rem]">
                    <RichMathText text={activeLesson.title} inlineMarkdown={false} />
                  </h1>

                  {activeLesson.subtitle && (
                    <p className="mt-2.5 text-base leading-8 text-[#475569] dark:text-[#94A3B8]">
                      <RichMathText text={activeLesson.subtitle} />
                    </p>
                  )}

                  {activeLesson.summary && (
                    <div className="mt-5 rounded-lg border border-[#E2E8F0] bg-white/80 px-4 py-3.5 text-sm leading-7 text-[#334155] dark:border-[#27323E] dark:bg-[#1C252E]/70 dark:text-[#CBD5E1]">
                      <span className="ml-1.5 font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                        چکیده فصل:
                      </span>
                      <RichMathText text={activeLesson.summary} />
                    </div>
                  )}
                </header>
              </SectionScopeContext.Provider>

              {/* Article Sections */}
              <div className="mt-8 space-y-11" style={{ fontSize: `${baseFontPx}px` }}>
                {activeLesson.sections.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white/80 px-6 py-10 text-center dark:border-[#364554] dark:bg-[#1C252E]/60 no-print">
                    <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      هنوز جزوه درسی (.md) برای این فصل ثبت نشده است
                    </p>
                    <p className="mt-1.5 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
                      فایل Markdown جزوه را مستقیماً بارگذاری کنید یا از بخش مدیریت منابع آن را اضافه نمایید.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                      {onOpenImportModal && (
                        <button
                          type="button"
                          onClick={onOpenImportModal}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
                        >
                          <FileUp className="h-3.5 w-3.5" />
                          <span>ورود فایل جزوه (.md)</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onChangeMode('resources')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF]"
                      >
                        <span>مدیریت منابع</span>
                      </button>
                    </div>
                  </div>
                )}

                {activeLesson.sections.map((section) => {
                  const sectionKey = `${activeLesson.id}:${section.id}`;
                  const isBookmarked = bookmarkedSections.includes(sectionKey);

                  return (
                    <SectionScopeContext.Provider key={section.id} value={section.id}>
                      <section id={section.id} data-section-id={section.id} className="scroll-mt-28 space-y-5">
                      <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0]/70 pb-3 dark:border-[#27323E]">
                        <h2 className="flex items-baseline gap-2.5 text-xl font-semibold leading-9 text-[#0F172A] dark:text-[#F8FAFC] sm:text-[1.4rem]">
                          <span className="font-mono text-sm font-semibold text-[#0D9488] tabular-nums dark:text-[#2DD4BF]">
                            {section.number}
                          </span>
                          <span>
                            <RichMathText text={section.title} inlineMarkdown={false} />
                          </span>
                        </h2>
                        <button
                          type="button"
                          onClick={() => onToggleBookmark(sectionKey)}
                          title={isBookmarked ? 'حذف نشانه‌گذاری بخش' : 'نشانه‌گذاری این بخش'}
                          aria-label={isBookmarked ? 'حذف نشانه‌گذاری' : 'نشانه‌گذاری بخش'}
                          className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors no-print ${
                            isBookmarked
                              ? 'border-[#FCD34D] bg-[#FFFBEB] text-[#D97706] dark:border-[#B45309]/50 dark:bg-[#451A03]/40 dark:text-[#FBBF24]'
                              : 'border-transparent text-[#94A3B8] hover:border-[#E2E8F0] hover:bg-white hover:text-[#334155] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E]'
                          }`}
                        >
                          <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
                        </button>
                      </div>

                      {/* Imported Markdown Body (Full RTL Markdown + KaTeX LaTeX) */}
                      {section.markdownBody && <MarkdownContent markdown={section.markdownBody} />}

                      {/* Structured Prose Paragraphs */}
                      {section.paragraphs.length > 0 && (
                        <div className="space-y-4">
                          {section.paragraphs.map((para, idx) => (
                            <p key={idx} className="leading-[2.0] text-[#1E293B] dark:text-[#CBD5E1]">
                              <RichMathText text={para} />
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Rich Article Callout Boxes */}
                      {section.callouts && section.callouts.length > 0 && (
                        <div className="space-y-4 pt-1">
                          {section.callouts.map((callout) => {
                            const style = CALLOUT_STYLES[callout.variant];
                            const Icon = style.icon;
                            const isFormulaCopied = copiedId === callout.id;

                            return (
                              <div key={callout.id} className={`rounded-xl p-4 sm:p-5 ${style.wrapper}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className={`flex items-center gap-2 text-sm font-semibold ${style.label}`}>
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span>{callout.title}</span>
                                  </div>
                                  {callout.formula && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(callout.id, callout.formula!)}
                                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#0F766E] transition-colors hover:bg-[#CCFBF1]/60 dark:text-[#2DD4BF] dark:hover:bg-[#134E4A]/50 no-print"
                                    >
                                      {isFormulaCopied ? (
                                        <>
                                          <Check className="h-3.5 w-3.5" />
                                          <span>کپی شد</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3.5 w-3.5" />
                                          <span>کپی فرمول</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>

                                <p className="mt-2 text-[0.94em] leading-[1.9] text-[#1E293B] dark:text-[#E2E8F0]">
                                  <RichMathText text={callout.content} />
                                </p>

                                {callout.formula && (
                                  <div className="mt-3 rounded-lg border border-[#0D9488]/20 bg-white px-4 py-3 text-sm font-medium text-[#0F172A] dark:border-[#14B8A6]/25 dark:bg-[#0F1419] dark:text-[#F1F5F9]">
                                    <FormulaDisplay formula={callout.formula} />
                                  </div>
                                )}

                                {callout.formulaCaption && (
                                  <p className="mt-2 text-xs leading-6 text-[#475569] dark:text-[#94A3B8]">
                                    <RichMathText text={callout.formulaCaption} />
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Technical Reference Table */}
                      {section.table && (
                        <div className="pt-1">
                          {section.table.caption && (
                            <p className="mb-2 text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                              {section.table.caption}
                            </p>
                          )}
                          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white dark:border-[#27323E] dark:bg-[#1C252E]">
                            <table className="w-full border-collapse text-right text-sm">
                              <thead>
                                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] dark:border-[#27323E] dark:bg-[#161D24]">
                                  {section.table.headers.map((header, idx) => (
                                    <th
                                      key={idx}
                                      className="px-4 py-3 text-xs font-semibold text-[#475569] dark:text-[#94A3B8]"
                                    >
                                      <RichMathText text={header} />
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27323E]">
                                {section.table.rows.map((row, rowIdx) => (
                                  <tr
                                    key={rowIdx}
                                    className="transition-colors hover:bg-[#F8FAFC]/80 dark:hover:bg-[#24303C]/50"
                                  >
                                    {row.map((cell, colIdx) => {
                                      const isLtr = section.table?.ltrColumns?.includes(colIdx);
                                      return (
                                        <td
                                          key={colIdx}
                                          className={`px-4 py-3 text-[13px] ${
                                            isLtr
                                              ? 'ltr-isolate text-[#0F172A] tabular-nums dark:text-[#E2E8F0]'
                                              : 'font-medium text-[#1E293B] dark:text-[#E2E8F0]'
                                          }`}
                                        >
                                          {isLtr ? (
                                            <FormulaDisplay formula={cell} inline />
                                          ) : (
                                            <RichMathText text={cell} />
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Isolated LTR Code Block */}
                      {section.codeBlock && (
                        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] dark:border-[#27323E] dark:bg-[#0F1419]">
                          <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 dark:border-[#27323E] dark:bg-[#1C252E]">
                            <span className="text-xs font-medium text-[#475569] dark:text-[#94A3B8]">
                              {section.codeBlock.caption}
                            </span>
                            <div className="flex items-center gap-2.5">
                              <span className="ltr-inline font-mono text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                                {section.codeBlock.language}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(`code-${section.id}`, section.codeBlock!.code)}
                                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#475569] transition-colors hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] dark:text-[#CBD5E1] dark:hover:bg-[#27323E] no-print"
                              >
                                {copiedId === `code-${section.id}` ? (
                                  <>
                                    <Check className="h-3.5 w-3.5 text-[#059669]" />
                                    <span className="text-[#059669]">کپی شد</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span>کپی کد</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <pre className="ltr-isolate overflow-x-auto p-4 font-mono text-[13px] leading-6 text-[#0F172A] dark:text-[#E2E8F0]">
                            <code>{section.codeBlock.code}</code>
                          </pre>
                        </div>
                      )}

                      {/* Key Takeaways */}
                      {section.keyPoints && section.keyPoints.length > 0 && (
                        <div className="rounded-xl border border-[#E2E8F0] bg-white px-5 py-4 dark:border-[#27323E] dark:bg-[#1C252E]">
                          <h3 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                            جمع‌بندی کلیدی این بخش
                          </h3>
                          <ul className="mt-2.5 space-y-2 text-[0.92em] leading-7 text-[#1E293B] dark:text-[#CBD5E1]">
                            {section.keyPoints.map((pt, i) => (
                              <li key={i} className="flex items-start gap-2.5">
                                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0D9488]" />
                                <span>
                                  <RichMathText text={pt} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      </section>
                    </SectionScopeContext.Provider>
                  );
                })}
              </div>
            </div>
          </HighlightContext.Provider>

          {/* Study Transition Strip */}
          <div className="mt-12 border-t border-[#E2E8F0] pt-7 dark:border-[#27323E] no-print">
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5 dark:border-[#27323E] dark:bg-[#1C252E] sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  تثبیت یادگیری این فصل
                </h3>
                <p className="mt-1 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
                  {activeLesson.flashcards.length} فلش‌کارت مرور و {activeLesson.quiz.length} سوال تستی آماده ارزیابی هستند.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onChangeMode('flashcards')}
                  className="flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-3.5 py-2 text-xs font-semibold text-[#1E293B] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#E2E8F0]"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>مرور فلش‌کارت‌ها</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMode('quiz')}
                  className="flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>شروع آزمون فصل</span>
                </button>
              </div>
            </div>

            {/* Chapter Pagination */}
            <div className="mt-6 flex items-center justify-between gap-3">
              {prevLesson ? (
                <button
                  type="button"
                  onClick={() => onSelectLesson(prevLesson.id)}
                  className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="max-w-[160px] truncate sm:max-w-none">
                    فصل قبل: {prevLesson.title}
                  </span>
                </button>
              ) : (
                <div />
              )}

              {nextLesson ? (
                <button
                  type="button"
                  onClick={() => onSelectLesson(nextLesson.id)}
                  className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs font-medium text-[#334155] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                >
                  <span className="max-w-[160px] truncate sm:max-w-none">
                    فصل بعد: {nextLesson.title}
                  </span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </main>

        {/* Left-Pinned Floating Index, Metadata & Highlights Rail (RTL Third Column) */}
        {leftSidebarOpen && (
          <aside
            className={`sticky top-[84px] max-h-[calc(100vh-110px)] space-y-6 overflow-y-auto pr-2 transition-opacity duration-200 ${
              rightSidebarOpen ? 'hidden xl:block' : 'hidden lg:block'
            }`}
          >
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onToggleLeftSidebar}
                  title="بستن ستون فهرست مطالب"
                  aria-label="بستن ستون فهرست مطالب"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
                <h2 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                  فهرست مطالب این فصل
                </h2>
              </div>
              <nav aria-label="فهرست مطالب" className="space-y-1 border-r border-[#E2E8F0] dark:border-[#27323E]">
                {activeLesson.sections.map((section) => {
                  const isActive = activeSectionId === section.id;
                  const isBookmarked = bookmarkedSections.includes(`${activeLesson.id}:${section.id}`);
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className={`-mr-px flex w-full items-center justify-between gap-2 border-r-2 py-1.5 pr-3 text-right text-xs leading-5 transition-colors ${
                        isActive
                          ? 'border-r-[#0D9488] font-semibold text-[#0F766E] dark:border-r-[#2DD4BF] dark:text-[#2DD4BF]'
                          : 'border-r-transparent text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8] dark:hover:text-[#E2E8F0]'
                      }`}
                    >
                      <span className="truncate">
                        {section.number} {section.title}
                      </span>
                      {isBookmarked && (
                        <Bookmark className="h-3 w-3 shrink-0 fill-[#D97706] text-[#D97706]" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Unboxed Metadata Summary */}
            <div className="border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
              <h3 className="mb-3 text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                شناسنامه جزوه
              </h3>
              <dl className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#64748B] dark:text-[#94A3B8]">منبع تدوین</dt>
                  <dd className="font-medium text-[#1E293B] dark:text-[#E2E8F0]">
                    {activeLesson.author}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#64748B] dark:text-[#94A3B8]">تعداد فلش‌کارت</dt>
                  <dd className="font-mono font-medium text-[#1E293B] tabular-nums dark:text-[#E2E8F0]">
                    {activeLesson.flashcards.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#64748B] dark:text-[#94A3B8]">سوالات آزمون</dt>
                  <dd className="font-mono font-medium text-[#1E293B] tabular-nums dark:text-[#E2E8F0]">
                    {activeLesson.quiz.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#64748B] dark:text-[#94A3B8]">یادداشت‌های شما</dt>
                  <dd className="font-mono font-medium text-[#0D9488] tabular-nums dark:text-[#2DD4BF]">
                    {lessonNotes.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#64748B] dark:text-[#94A3B8]">هایلایت‌های فصل</dt>
                  <dd className="font-mono font-medium text-[#D97706] tabular-nums dark:text-[#FBBF24]">
                    {lessonHighlights.length}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Persisted Highlights Panel */}
            {lessonHighlights.length > 0 && (
              <div className="border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                    هایلایت‌های ذخیره‌شده
                  </h3>
                  <button
                    type="button"
                    onClick={onClearLessonHighlights}
                    className="text-[11px] font-medium text-[#DC2626] hover:underline dark:text-[#F87171]"
                  >
                    پاک کردن همه
                  </button>
                </div>
                <div className="space-y-2">
                  {lessonHighlights.map((hl) => {
                    const sw = HIGHLIGHT_SWATCHES.find((s) => s.color === hl.color) ?? HIGHLIGHT_SWATCHES[0];
                    const hasFormula = hl.anchors?.some((a) => a.kind === 'formula') ?? false;
                    return (
                      <div
                        key={hl.id}
                        className="group space-y-2 rounded-lg border border-[#E2E8F0] bg-[#FAF9F6] p-2.5 text-xs dark:border-[#27323E] dark:bg-[#161D24]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (hl.sectionId === '__header__') {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              } else if (hl.sectionId) {
                                scrollToSection(hl.sectionId);
                              }
                            }}
                            className="flex min-w-0 flex-1 items-start gap-2 text-right"
                          >
                            <span
                              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border ${sw.swatchBg} ${sw.ringColor}`}
                            />
                            <span className="line-clamp-2 min-w-0 flex-1 leading-6 text-[#1E293B] dark:text-[#CBD5E1]">
                              <RichMathText text={hl.text} inlineMarkdown={false} />
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveHighlight(hl.id)}
                            aria-label="حذف هایلایت"
                            title="حذف هایلایت"
                            className="shrink-0 rounded p-0.5 text-[#94A3B8] transition-colors hover:text-[#DC2626]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex items-center gap-1">
                            {HIGHLIGHT_SWATCHES.map((opt) => (
                              <button
                                key={opt.color}
                                type="button"
                                onClick={() => onUpdateHighlightColor(hl.id, opt.color)}
                                title={`تغییر رنگ به ${opt.label}`}
                                aria-label={`تغییر رنگ به ${opt.label}`}
                                className={`h-3.5 w-3.5 rounded-full border transition-transform hover:scale-110 ${opt.swatchBg} ${opt.ringColor} ${
                                  hl.color === opt.color
                                    ? 'ring-1 ring-[#0D9488] ring-offset-1 dark:ring-offset-[#161D24]'
                                    : 'opacity-70 hover:opacity-100'
                                }`}
                              />
                            ))}
                          </div>
                          {hasFormula && (
                            <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                              <Sigma className="h-3 w-3" />
                              <span>فرمول</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {lessonNotes.length > 0 && (
              <div className="border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
                <h3 className="mb-2.5 text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                  آخرین حاشیه‌نویسی‌ها
                </h3>
                <div className="space-y-2">
                  {lessonNotes.slice(0, 2).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-lg border border-[#E2E8F0] bg-[#FAF9F6] p-3 text-xs dark:border-[#27323E] dark:bg-[#161D24]"
                    >
                      <p className="font-semibold text-[#0F172A] dark:text-[#F1F5F9]">{note.title}</p>
                      <p className="mt-1 line-clamp-2 leading-5 text-[#475569] dark:text-[#94A3B8]">
                        {note.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};
