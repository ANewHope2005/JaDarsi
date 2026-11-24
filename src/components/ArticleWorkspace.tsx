import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
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
  Highlighter,
  Trash2,
  RotateCcw,
  FileUp,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  GripVertical,
  MessageSquarePlus,
  Pencil,
  Plus,
  Play,
  Pause,
  Gauge,
} from 'lucide-react';
import {
  ArticleCallout,
  Course,
  HighlightAnchor,
  HighlightColor,
  Lesson,
  PassageComment,
  TextHighlight,
  UserNote,
  WorkspaceMode,
} from '../types/study';
import {
  extractMarkdownSubheadings,
  FormulaDisplay,
  HighlightContext,
  MarkdownContent,
  normalizeFormulaKey,
  RichMathText,
  SectionScopeContext,
  stripInlineMarkdown,
} from '../utils/latexText';
import {
  formatStudyDurationPersian,
  LiveReadingSnapshot,
  ReadingCheckpoint,
} from './StudyTimerWidget';
import { FlashcardIcon } from './icons/FlashcardIcon';
import { FocusTargetIcon } from './icons/FocusTargetIcon';
import { HoverTooltip } from './ui/HoverTooltip';

export interface NewHighlightPayload {
  text: string;
  anchors: HighlightAnchor[];
  color: HighlightColor;
  sectionId?: string;
}

interface ArticleWorkspaceProps {
  courses?: Course[];
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
  headerCollapsed: boolean;
  isFocusMode: boolean;
  studySeconds: number;
  savedCheckpoint?: ReadingCheckpoint | null;
  onReadingStateChange?: (snapshot: LiveReadingSnapshot) => void;
  onToggleRightSidebar: () => void;
  onToggleLeftSidebar: () => void;
  onToggleFocusMode: () => void;
  lessonHighlights: TextHighlight[];
  onAddHighlight: (payload: NewHighlightPayload) => string | null;
  onRemoveHighlight: (highlightId: string) => void;
  onRestoreHighlight: (highlight: TextHighlight) => void;
  onUpdateHighlightColor: (highlightId: string, color: HighlightColor) => void;
  onClearLessonHighlights: () => void;
  onOpenImportModal?: () => void;
  onReorderCourses?: (dragCourseId: string, targetCourseId: string) => void;
  onReorderLessons?: (dragLessonId: string, targetLessonId: string | null, targetCourseId?: string) => void;
  onUpdateSection?: (lessonId: string, sectionId: string, updates: { title: string; markdownBody: string }) => void;
  onAddSection?: (lessonId: string, input: { title: string; markdownBody: string }) => void;
  onDeleteSection?: (lessonId: string, sectionId: string) => void;
  lessonComments?: PassageComment[];
  onAddPassageComment?: (payload: { sectionId?: string; quote: string; comment: string }) => void;
  onUpdatePassageComment?: (commentId: string, comment: string) => void;
  onDeletePassageComment?: (commentId: string) => void;
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

const ARTICLE_STORAGE_KEYS = {
  scrollPositions: 'jadarsi_scroll_positions_v1',
  highlightEnabled: 'jadarsi_highlight_mode_v1',
  defaultHighlightColor: 'jadarsi_default_highlight_color_v1',
};

function readScrollPositions(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(ARTICLE_STORAGE_KEYS.scrollPositions);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveScrollPosition(lessonId: string, scrollY: number) {
  try {
    const map = readScrollPositions();
    map[lessonId] = Math.max(0, Math.round(scrollY));
    window.localStorage.setItem(ARTICLE_STORAGE_KEYS.scrollPositions, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function readInitialHighlightEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(ARTICLE_STORAGE_KEYS.highlightEnabled);
    return raw === 'true';
  } catch {
    return false;
  }
}

function readInitialDefaultHighlightColor(): HighlightColor {
  try {
    const raw = window.localStorage.getItem(ARTICLE_STORAGE_KEYS.defaultHighlightColor);
    if (raw === 'yellow' || raw === 'amber' || raw === 'green' || raw === 'blue') {
      return raw;
    }
  } catch {
    // fallback
  }
  return 'yellow';
}

interface QuickColorBarState {
  highlightId: string;
  color: HighlightColor;
  hasFormula: boolean;
  quote: string;
  sectionId?: string;
  x: number;
  y: number;
}

interface SelectionActionBarState {
  quote: string;
  anchors: HighlightAnchor[];
  sectionId?: string;
  x: number;
  y: number;
}

const AUTOSCROLL_PRESETS = [
  { label: 'آرام', speed: 0.7 },
  { label: 'متوسط', speed: 1.4 },
  { label: 'سریع', speed: 2.5 },
];

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

      // Extract pure prose segments excluding atomic formulas, KaTeX, code, and buttons.
      // Preserve inline formatting (strong, em, span, mark) as one contiguous text anchor
      // while inserting newline boundaries between separate blocks (p, li, headings, table cells).
      const textWrapper = document.createElement('div');
      textWrapper.appendChild(fragment);
      textWrapper
        .querySelectorAll('[data-formula-atomic="true"], .katex, .katex-mathml, pre, code, button')
        .forEach((el) => {
          el.replaceWith(document.createTextNode('\n'));
        });
      textWrapper.querySelectorAll('br').forEach((br) => {
        br.replaceWith(document.createTextNode('\n'));
      });
      textWrapper
        .querySelectorAll('p, li, div, h1, h2, h3, h4, h5, h6, tr, td, th, blockquote, hr')
        .forEach((blockEl) => {
          blockEl.prepend(document.createTextNode('\n'));
          blockEl.append(document.createTextNode('\n'));
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
  courses = [],
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
  headerCollapsed,
  isFocusMode,
  studySeconds,
  savedCheckpoint,
  onReadingStateChange,
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
  onReorderCourses,
  onReorderLessons,
  onUpdateSection,
  onAddSection,
  onDeleteSection,
  lessonComments = [],
  onAddPassageComment,
  onUpdatePassageComment,
  onDeletePassageComment,
}) => {
  const [activeTocId, setActiveTocId] = useState<string>(activeLesson.sections[0]?.id ?? '');
  const [readingProgress, setReadingProgress] = useState<number>(0);
  const [isScrollable, setIsScrollable] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [highlightModeEnabled, setHighlightModeEnabled] = useState<boolean>(() =>
    readInitialHighlightEnabled()
  );
  const [defaultHighlightColor, setDefaultHighlightColor] = useState<HighlightColor>(() =>
    readInitialDefaultHighlightColor()
  );
  const [quickColorBar, setQuickColorBar] = useState<QuickColorBarState | null>(null);
  const [selectionBar, setSelectionBar] = useState<SelectionActionBarState | null>(null);
  const [removedToast, setRemovedToast] = useState<TextHighlight | null>(null);

  // Inline Passage Comment composer & editing
  const [commentComposer, setCommentComposer] = useState<{
    quote: string;
    sectionId?: string;
    text: string;
  } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState('');

  // Single-item section editing / adding / deleting
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState('');
  const [editSectionBody, setEditSectionBody] = useState('');
  const [confirmDeleteSectionId, setConfirmDeleteSectionId] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionBody, setNewSectionBody] = useState('');

  // Auto-Scroll with speed control
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(1.2);
  const [autoScrollPanelOpen, setAutoScrollPanelOpen] = useState(false);
  const autoScrollSpeedRef = useRef(autoScrollSpeed);
  autoScrollSpeedRef.current = autoScrollSpeed;

  // Sidebar Drag & Drop course and same-course session reorder
  const [draggedCourseId, setDraggedCourseId] = useState<string | null>(null);
  const [dropCourseId, setDropCourseId] = useState<string | null>(null);
  const [draggedLesson, setDraggedLesson] = useState<{ id: string; courseKey: string } | null>(
    null
  );
  const [dropLessonId, setDropLessonId] = useState<string | null>(null);

  const readingBodyRef = useRef<HTMLDivElement>(null);
  const leftAsideRef = useRef<HTMLElement>(null);
  const tocItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const undoTimerRef = useRef<number | null>(null);
  const quickBarTimerRef = useRef<number | null>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);
  const latestScrollYRef = useRef<number>(0);
  const isRestoringScrollRef = useRef<boolean>(false);
  const hasPendingFocusJumpRef = useRef<boolean>(Boolean(focusSectionId));
  const rightProgressBarRef = useRef<HTMLDivElement | null>(null);
  const leftProgressBarRef = useRef<HTMLDivElement | null>(null);
  const targetProgressRef = useRef<number>(0);
  const displayedProgressRef = useRef<number>(0);
  const progressRafRef = useRef<number | null>(null);

  // Reset transient editing / auto-scroll state when lesson changes
  useEffect(() => {
    setAutoScrollActive(false);
    setSelectionBar(null);
    setCommentComposer(null);
    setEditingSectionId(null);
    setConfirmDeleteSectionId(null);
    setAddingSection(false);
  }, [activeLesson.id]);

  // Smooth requestAnimationFrame Auto-Scroll loop (auto-pauses on manual scroll or bottom reach)
  useEffect(() => {
    if (!autoScrollActive) return;

    let rafId = 0;
    let lastTs = performance.now();
    let carry = 0;

    const pauseOnUserIntent = () => {
      setAutoScrollActive(false);
    };
    const pauseOnScrollKey = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Escape'].includes(
          e.key
        )
      ) {
        setAutoScrollActive(false);
      }
    };

    window.addEventListener('wheel', pauseOnUserIntent, { passive: true });
    window.addEventListener('touchstart', pauseOnUserIntent, { passive: true });
    window.addEventListener('keydown', pauseOnScrollKey);

    const step = (now: number) => {
      const dt = Math.min(0.08, (now - lastTs) / 1000);
      lastTs = now;

      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      if (window.scrollY >= maxScroll - 2) {
        setAutoScrollActive(false);
        return;
      }

      carry += dt * autoScrollSpeedRef.current * 44;
      const wholePx = Math.floor(carry);
      if (wholePx >= 1) {
        carry -= wholePx;
        window.scrollBy(0, wholePx);
      }

      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('wheel', pauseOnUserIntent);
      window.removeEventListener('touchstart', pauseOnUserIntent);
      window.removeEventListener('keydown', pauseOnScrollKey);
    };
  }, [autoScrollActive]);

  // Dismiss selectionBar on scroll or outside click
  useEffect(() => {
    if (!selectionBar) return;
    const dismiss = () => setSelectionBar(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectionBar(null);
    };
    window.addEventListener('scroll', dismiss, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [selectionBar]);

  // Precompute TOC sections with their level-3 Markdown subheadings
  const tocSections = useMemo(
    () =>
      activeLesson.sections.map((section) => ({
        section,
        subheadings: extractMarkdownSubheadings(section.markdownBody, section.id),
      })),
    [activeLesson.sections]
  );

  const flatTocTargets = useMemo(() => {
    const items: { id: string; parentSectionId: string; title: string; isSubheading: boolean }[] = [];
    for (const entry of tocSections) {
      items.push({
        id: entry.section.id,
        parentSectionId: entry.section.id,
        title: stripInlineMarkdown(entry.section.title),
        isSubheading: false,
      });
      for (const sub of entry.subheadings) {
        items.push({
          id: sub.id,
          parentSectionId: entry.section.id,
          title: stripInlineMarkdown(sub.title),
          isSubheading: true,
        });
      }
    }
    return items;
  }, [tocSections]);

  const activeTocEntry = useMemo(
    () => flatTocTargets.find((t) => t.id === activeTocId) ?? flatTocTargets[0] ?? null,
    [flatTocTargets, activeTocId]
  );

  const activeSectionId = activeTocEntry?.parentSectionId ?? activeLesson.sections[0]?.id ?? '';

  // Keep parent synced with live active subsection & scroll progress (used when saving study session on pause)
  useEffect(() => {
    if (!onReadingStateChange) return;
    onReadingStateChange({
      lessonId: activeLesson.id,
      sectionId: activeTocEntry?.id ?? activeSectionId,
      sectionTitle: activeTocEntry?.title ?? activeLesson.title,
      progressPercent: readingProgress,
      scrollY: Math.max(0, Math.round(window.scrollY)),
    });
  }, [
    onReadingStateChange,
    activeLesson.id,
    activeLesson.title,
    activeTocEntry,
    activeSectionId,
    readingProgress,
  ]);

  // Persist Highlight Mode ON/OFF and Default Highlight Color
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ARTICLE_STORAGE_KEYS.highlightEnabled,
        String(highlightModeEnabled)
      );
      window.localStorage.setItem(
        ARTICLE_STORAGE_KEYS.defaultHighlightColor,
        defaultHighlightColor
      );
    } catch {
      // ignore storage errors
    }
  }, [highlightModeEnabled, defaultHighlightColor]);

  useEffect(() => {
    hasPendingFocusJumpRef.current = Boolean(focusSectionId);
  }, [focusSectionId]);

  // Reset transient UI state when switching lesson
  useEffect(() => {
    setActiveTocId(activeLesson.sections[0]?.id ?? '');
    setQuickColorBar(null);
    setRemovedToast(null);
  }, [activeLesson.id, activeLesson.sections]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
      if (quickBarTimerRef.current !== null) window.clearTimeout(quickBarTimerRef.current);
      if (scrollSaveTimerRef.current !== null) window.clearTimeout(scrollSaveTimerRef.current);
      if (progressRafRef.current !== null) window.cancelAnimationFrame(progressRafRef.current);
    };
  }, []);

  // Silky-smooth 60fps damped GPU transform animation for mirrored vertical reading progress bars
  const scheduleSmoothProgressBar = useCallback((nextTargetPct: number, immediate = false) => {
    targetProgressRef.current = nextTargetPct;

    const applyTransform = (pct: number) => {
      const clamped = Math.min(100, Math.max(0, pct));
      const transformVal = `translate3d(0, ${-(100 - clamped)}%, 0)`;
      if (rightProgressBarRef.current) {
        rightProgressBarRef.current.style.transform = transformVal;
      }
      if (leftProgressBarRef.current) {
        leftProgressBarRef.current.style.transform = transformVal;
      }
    };

    if (immediate) {
      if (progressRafRef.current !== null) {
        window.cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
      displayedProgressRef.current = nextTargetPct;
      applyTransform(nextTargetPct);
      return;
    }

    if (progressRafRef.current !== null) return;

    let lastTime = performance.now();
    const animate = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;
      const diff = targetProgressRef.current - displayedProgressRef.current;

      if (Math.abs(diff) < 0.08) {
        displayedProgressRef.current = targetProgressRef.current;
        applyTransform(displayedProgressRef.current);
        progressRafRef.current = null;
        return;
      }

      // Frame-rate independent exponential smoothing for smooth glide during manual wheel/trackpad scroll
      const factor = 1 - Math.exp(-14 * dt);
      displayedProgressRef.current += diff * factor;
      applyTransform(displayedProgressRef.current);
      progressRafRef.current = window.requestAnimationFrame(animate);
    };

    progressRafRef.current = window.requestAnimationFrame(animate);
  }, []);

  // Deterministic Scroll Spy + Vertical Reading Progress computation
  const computeScrollSpyAndProgress = useCallback(
    (immediateBar = false) => {
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      const maxScroll = Math.max(0, docHeight - winHeight);

      setIsScrollable((prev) => {
        const next = maxScroll > 140;
        return prev === next ? prev : next;
      });

      const exactProgress =
        maxScroll <= 0 ? 0 : Math.min(100, Math.max(0, (scrollY / maxScroll) * 100));
      scheduleSmoothProgressBar(exactProgress, immediateBar);

      const roundedProgress = Math.round(exactProgress);
      setReadingProgress((prev) => (prev === roundedProgress ? prev : roundedProgress));

    if (flatTocTargets.length === 0) return;

    // If scrolled right to the bottom of the lecture note, highlight the final heading/subsection
    if (maxScroll > 40 && scrollY >= maxScroll - 24) {
      const lastId = flatTocTargets[flatTocTargets.length - 1].id;
      setActiveTocId((prev) => (prev === lastId ? prev : lastId));
      return;
    }

    const triggerOffset = headerCollapsed ? 80 : 132;
    let currentId = flatTocTargets[0].id;

    for (const target of flatTocTargets) {
      const el = document.getElementById(target.id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= triggerOffset) {
        currentId = target.id;
      } else {
        break;
      }
    }

      setActiveTocId((prev) => (prev === currentId ? prev : currentId));
    },
    [flatTocTargets, headerCollapsed, scheduleSmoothProgressBar]
  );

  const computeScrollSpyRef = useRef(computeScrollSpyAndProgress);
  computeScrollSpyRef.current = computeScrollSpyAndProgress;

  // Restore last scroll position per lesson on mount / lesson change, and flush-save on depart
  useEffect(() => {
    const lessonId = activeLesson.id;

    if (!hasPendingFocusJumpRef.current) {
      const savedMap = readScrollPositions();
      const savedY = savedMap[lessonId] ?? 0;
      isRestoringScrollRef.current = true;

      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const clampedY = Math.min(savedY, maxScroll);
          window.scrollTo({ top: clampedY, behavior: 'auto' });
          latestScrollYRef.current = clampedY;
          isRestoringScrollRef.current = false;
          computeScrollSpyRef.current(true);
        });
      });

      return () => {
        window.cancelAnimationFrame(raf1);
        if (raf2) window.cancelAnimationFrame(raf2);
        isRestoringScrollRef.current = false;
        if (scrollSaveTimerRef.current !== null) {
          window.clearTimeout(scrollSaveTimerRef.current);
          scrollSaveTimerRef.current = null;
        }
        saveScrollPosition(lessonId, latestScrollYRef.current);
      };
    }

    return () => {
      if (scrollSaveTimerRef.current !== null) {
        window.clearTimeout(scrollSaveTimerRef.current);
        scrollSaveTimerRef.current = null;
      }
      saveScrollPosition(lessonId, latestScrollYRef.current);
    };
  }, [activeLesson.id]);

  // Smooth jump when redirected from Mindmap, Search, Flashcards, or Bookmarks
  useEffect(() => {
    if (!focusSectionId) return;
    const rafId = window.requestAnimationFrame(() => {
      const el = document.getElementById(focusSectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveTocId(focusSectionId);
      }
      hasPendingFocusJumpRef.current = false;
      onClearFocusSection();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [focusSectionId, activeLesson.id, onClearFocusSection]);

  // Unified rAF scroll + resize listener for Scroll Spy, Reading Progress, and Debounced Scroll Persistence
  useEffect(() => {
    const lessonId = activeLesson.id;
    let ticking = false;

    const handleScroll = () => {
      if (!isRestoringScrollRef.current) {
        latestScrollYRef.current = window.scrollY;
        if (scrollSaveTimerRef.current !== null) {
          window.clearTimeout(scrollSaveTimerRef.current);
        }
        scrollSaveTimerRef.current = window.setTimeout(() => {
          saveScrollPosition(lessonId, latestScrollYRef.current);
          scrollSaveTimerRef.current = null;
        }, 160);
      }

      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(() => {
          computeScrollSpyAndProgress();
          ticking = false;
        });
      }
    };

    const handlePageHide = () => {
      saveScrollPosition(lessonId, window.scrollY);
    };

    computeScrollSpyAndProgress(true);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [activeLesson.id, computeScrollSpyAndProgress]);

  // Keep active TOC item visible inside the left sidebar without affecting window scroll
  useEffect(() => {
    if (!leftSidebarOpen || !activeTocId) return;
    const aside = leftAsideRef.current;
    const btn = tocItemRefs.current[activeTocId];
    if (!aside || !btn || aside.scrollHeight <= aside.clientHeight) return;

    const asideRect = aside.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const pad = 28;
    if (btnRect.top < asideRect.top + pad) {
      aside.scrollTo({
        top: aside.scrollTop - (asideRect.top + pad - btnRect.top),
        behavior: 'smooth',
      });
    } else if (btnRect.bottom > asideRect.bottom - pad) {
      aside.scrollTo({
        top: aside.scrollTop + (btnRect.bottom - (asideRect.bottom - pad)),
        behavior: 'smooth',
      });
    }
  }, [activeTocId, leftSidebarOpen]);

  // Dismiss quick color bar on Escape or window scroll
  useEffect(() => {
    if (!quickColorBar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setQuickColorBar(null);
      }
    };
    const onScroll = () => {
      setQuickColorBar(null);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll);
    };
  }, [quickColorBar]);

  const scheduleQuickBarDismiss = useCallback(() => {
    if (quickBarTimerRef.current !== null) {
      window.clearTimeout(quickBarTimerRef.current);
    }
    quickBarTimerRef.current = window.setTimeout(() => {
      setQuickColorBar(null);
      quickBarTimerRef.current = null;
    }, 4200);
  }, []);

  const handleReadingSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelectionBar(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const container = readingBodyRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelectionBar(null);
      return;
    }

    // Ignore selections purely inside inputs/textareas/code/buttons (allow KaTeX formulas, strong, em, lists)
    const startEl = getElementFromNode(range.startContainer);
    const endEl = getElementFromNode(range.endContainer);
    if (
      startEl?.closest('pre, button, input, textarea, form') &&
      endEl?.closest('pre, button, input, textarea, form')
    ) {
      return;
    }

    const extracted = extractSelectionHighlight(range, container);
    if (!extracted || extracted.anchors.length === 0) {
      setSelectionBar(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const startSection = findEnclosingSectionId(range.startContainer);
    const endSection = findEnclosingSectionId(range.endContainer);
    const scopedSectionId =
      startSection && startSection === endSection ? startSection : undefined;

    const clampedX = Math.max(150, Math.min(window.innerWidth - 150, rect.left + rect.width / 2));
    const clampedY = Math.max(headerCollapsed ? 58 : 78, rect.top - 10);

    // When Highlight Mode is OFF, keep native text selection intact and offer Comment + quick Highlight pill
    if (!highlightModeEnabled) {
      setSelectionBar({
        quote: extracted.displayText,
        anchors: extracted.anchors,
        sectionId: scopedSectionId,
        x: clampedX,
        y: clampedY,
      });
      return;
    }

    // Immediately apply highlight with the active default color
    const createdId = onAddHighlight({
      text: extracted.displayText,
      anchors: extracted.anchors,
      color: defaultHighlightColor,
      sectionId: scopedSectionId,
    });

    sel.removeAllRanges();
    setSelectionBar(null);

    if (createdId) {
      setQuickColorBar({
        highlightId: createdId,
        color: defaultHighlightColor,
        hasFormula: extracted.hasFormula,
        quote: extracted.displayText,
        sectionId: scopedSectionId,
        x: clampedX,
        y: clampedY,
      });
      scheduleQuickBarDismiss();
    }
  }, [
    highlightModeEnabled,
    defaultHighlightColor,
    onAddHighlight,
    headerCollapsed,
    scheduleQuickBarDismiss,
  ]);

  const handleQuickRecolor = (color: HighlightColor) => {
    if (!quickColorBar) return;
    onUpdateHighlightColor(quickColorBar.highlightId, color);
    setDefaultHighlightColor(color);
    setQuickColorBar((prev) => (prev ? { ...prev, color } : null));
    scheduleQuickBarDismiss();
  };

  const handleSelectToolbarHighlightColor = (color: HighlightColor) => {
    setDefaultHighlightColor(color);
    if (!highlightModeEnabled) {
      setHighlightModeEnabled(true);
    }
  };

  // Clicking any existing highlight (plain text OR atomic formula) cleanly removes it
  // without altering the underlying formula DOM, offering a brief Undo toast.
  const handleClickExistingHighlight = useCallback(
    (highlight: TextHighlight) => {
      setQuickColorBar(null);
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

  const scrollToTarget = (targetId: string) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveTocId(targetId);
    }
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToBottom = () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  };

  const currentIdx = lessons.findIndex((l) => l.id === activeLesson.id);
  const prevLesson = currentIdx > 0 ? lessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < lessons.length - 1 ? lessons[currentIdx + 1] : null;

  const baseFontPx = 16 + fontScale * 1.5;
  const bothCollapsed = !rightSidebarOpen && !leftSidebarOpen;
  const stickySidebarOffsetClass = headerCollapsed
    ? 'top-[54px] max-h-[calc(100vh-74px)]'
    : 'top-[84px] max-h-[calc(100vh-110px)]';

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

        <nav aria-label="ناوبری سرفصل‌ها" className="space-y-3">
          {(() => {
            const grouped: { courseId?: string; courseName: string; items: Lesson[] }[] = [];
            if (courses.length > 0) {
              const usedIds = new Set<string>();
              for (const c of courses) {
                const items = lessons.filter((l) =>
                  l.courseId ? l.courseId === c.id : l.course === c.name
                );
                items.forEach((i) => usedIds.add(i.id));
                grouped.push({ courseId: c.id, courseName: c.name, items });
              }
              const leftovers = lessons.filter((l) => !usedIds.has(l.id));
              if (leftovers.length > 0) {
                grouped.push({ courseName: 'سایر جلسات', items: leftovers });
              }
            } else {
              const map = new Map<string, Lesson[]>();
              for (const l of lessons) {
                const key = l.course || 'درس‌های من';
                map.set(key, [...(map.get(key) ?? []), l]);
              }
              map.forEach((items, courseName) => grouped.push({ courseName, items }));
            }

            return grouped.map((group) => {
              const groupKey = group.courseId ?? group.courseName;
              const isCourseDropTarget = Boolean(
                group.courseId && draggedCourseId && dropCourseId === group.courseId
              );
              return (
                <div
                  key={groupKey}
                  draggable={Boolean(group.courseId && onReorderCourses)}
                  onDragStart={(e) => {
                    if (!group.courseId || !onReorderCourses) return;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', `course:${group.courseId}`);
                    setDraggedCourseId(group.courseId);
                  }}
                  onDragEnd={() => {
                    setDraggedCourseId(null);
                    setDropCourseId(null);
                  }}
                  onDragOver={(e) => {
                    // Only allow course-level reordering on course containers (never cross-course session drops)
                    if (!group.courseId || !draggedCourseId || draggedCourseId === group.courseId) {
                      return;
                    }
                    e.preventDefault();
                    setDropCourseId(group.courseId);
                  }}
                  onDrop={(e) => {
                    if (!group.courseId || !draggedCourseId || draggedCourseId === group.courseId) {
                      return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    if (onReorderCourses) {
                      onReorderCourses(draggedCourseId, group.courseId);
                    }
                    setDraggedCourseId(null);
                    setDropCourseId(null);
                  }}
                  className={`space-y-1 rounded-lg transition-colors ${
                    isCourseDropTarget
                      ? 'bg-[#F0FDFA]/70 ring-1 ring-[#0D9488] dark:bg-[#0F2928]/45 dark:ring-[#14B8A6]'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 px-1.5 py-1 text-[11px] font-bold text-[#475569] dark:text-[#94A3B8]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {group.courseId && onReorderCourses && (
                        <span
                          title="کشیدن برای تغییر ترتیب درس"
                          className="cursor-grab text-[#94A3B8] hover:text-[#475569] active:cursor-grabbing dark:hover:text-[#CBD5E1]"
                        >
                          <GripVertical className="h-3 w-3" />
                        </span>
                      )}
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]" />
                      <span className="truncate">{group.courseName}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums opacity-75">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.items.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-[10px] text-[#94A3B8] dark:text-[#64748B]">
                        بدون جلسه
                      </div>
                    ) : (
                      group.items.map((lesson) => {
                        const isCurrent = lesson.id === activeLesson.id;
                        const mastery = lessonMasteryMap[lesson.id] ?? 0;
                        const isSameCourseDrag = Boolean(
                          draggedLesson &&
                            draggedLesson.id !== lesson.id &&
                            draggedLesson.courseKey === groupKey
                        );
                        const isDropTarget = isSameCourseDrag && dropLessonId === lesson.id;
                        return (
                          <div
                            key={lesson.id}
                            draggable={Boolean(onReorderLessons)}
                            onDragStart={(e) => {
                              if (!onReorderLessons) return;
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', lesson.id);
                              setDraggedCourseId(null);
                              setDropCourseId(null);
                              setDraggedLesson({ id: lesson.id, courseKey: groupKey });
                            }}
                            onDragEnd={() => {
                              setDraggedLesson(null);
                              setDropLessonId(null);
                            }}
                            onDragOver={(e) => {
                              if (!isSameCourseDrag) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setDropLessonId(lesson.id);
                            }}
                            onDragLeave={() => {
                              setDropLessonId((prev) => (prev === lesson.id ? null : prev));
                            }}
                            onDrop={(e) => {
                              if (!isSameCourseDrag || !draggedLesson || !onReorderLessons) return;
                              e.preventDefault();
                              e.stopPropagation();
                              onReorderLessons(draggedLesson.id, lesson.id, group.courseId);
                              setDraggedLesson(null);
                              setDropLessonId(null);
                            }}
                            className={`group flex items-start gap-1 rounded-lg border px-2 py-2.5 transition-all duration-150 ${
                              isDropTarget
                                ? 'border-[#0D9488] bg-[#F0FDFA] dark:border-[#14B8A6] dark:bg-[#0F2928]'
                                : isCurrent
                                ? 'border-[#0D9488]/40 bg-[#FAF9F6] shadow-xs dark:border-[#14B8A6]/40 dark:bg-[#161D24]'
                                : 'border-transparent bg-transparent hover:border-[#E2E8F0] hover:bg-white/70 dark:hover:border-[#27323E] dark:hover:bg-[#1C252E]/60'
                            }`}
                          >
                            {onReorderLessons && (
                              <span
                                title="کشیدن برای تغییر ترتیب جلسه درون همین درس"
                                className="mt-1 cursor-grab text-[#94A3B8] opacity-60 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                onSelectLesson(lesson.id);
                                onCloseMobileSyllabus();
                              }}
                              className="flex min-w-0 flex-1 flex-col text-right"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="ltr-inline font-mono text-[10px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                                  {lesson.code}
                                </span>
                                <span className="text-[10px] text-[#64748B] tabular-nums dark:text-[#94A3B8]">
                                  جلسه {lesson.chapterNumber}
                                </span>
                              </div>
                              <span
                                className={`mt-1 text-xs font-semibold leading-5 ${
                                  isCurrent
                                    ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                                    : 'text-[#1E293B] group-hover:text-[#0F172A] dark:text-[#E2E8F0]'
                                }`}
                              >
                                {lesson.title}
                              </span>
                              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                                <span>{lesson.readingMinutes} دقیقه</span>
                                {mastery > 0 && (
                                  <span className="font-medium text-[#059669] tabular-nums dark:text-[#34D399]">
                                    تسلط {mastery}٪
                                  </span>
                                )}
                              </div>
                              {mastery > 0 && (
                                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#27323E]">
                                  <div
                                    className="h-full rounded-full bg-[#0D9488] transition-all duration-300"
                                    style={{ width: `${mastery}%` }}
                                  />
                                </div>
                              )}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            });
          })()}
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
      {/* Unobtrusive Floating Scroll-to-Top & Scroll-to-Bottom Controls */}
      {isScrollable && (
        <div
          className="elevation-tier-2 fixed bottom-5 left-4 z-30 flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white/90 backdrop-blur-sm dark:border-[#364554] dark:bg-[#1C252E]/90 no-print"
          role="group"
          aria-label="پیمایش سریع جزوه"
        >
          <button
            type="button"
            onClick={handleScrollToTop}
            disabled={readingProgress <= 1}
            title="رفتن به بالای جزوه"
            aria-label="رفتن به بالای جزوه"
            className="flex h-9 w-9 items-center justify-center text-[#475569] transition-colors hover:bg-[#F0FDFA] hover:text-[#0F766E] disabled:cursor-default disabled:opacity-30 dark:text-[#CBD5E1] dark:hover:bg-[#0F2928] dark:hover:text-[#2DD4BF]"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <div className="h-px bg-[#E2E8F0] dark:bg-[#27323E]" />
          <button
            type="button"
            onClick={handleScrollToBottom}
            disabled={readingProgress >= 99}
            title="رفتن به پایین جزوه"
            aria-label="رفتن به پایین جزوه"
            className="flex h-9 w-9 items-center justify-center text-[#475569] transition-colors hover:bg-[#F0FDFA] hover:text-[#0F766E] disabled:cursor-default disabled:opacity-30 dark:text-[#CBD5E1] dark:hover:bg-[#0F2928] dark:hover:text-[#2DD4BF]"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Floating Selection Pill (when Highlight Mode is OFF): Add Inline Comment or Quick Highlight */}
      {selectionBar && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            left: `${selectionBar.x}px`,
            top: `${selectionBar.y}px`,
          }}
          className="elevation-tier-3 fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-2 py-1.5 dark:border-[#364554] dark:bg-[#1C252E] no-print"
        >
          {onAddPassageComment && (
            <button
              type="button"
              onClick={() => {
                setCommentComposer({
                  quote: selectionBar.quote,
                  sectionId: selectionBar.sectionId,
                  text: '',
                });
                setSelectionBar(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#0F766E]"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>افزودن دیدگاه / یادداشت</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onAddHighlight({
                text: selectionBar.quote,
                anchors: selectionBar.anchors,
                color: defaultHighlightColor,
                sectionId: selectionBar.sectionId,
              });
              setSelectionBar(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2 py-1 text-[11px] font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:text-[#CBD5E1]"
          >
            <Highlighter className="h-3 w-3" />
            <span>هایلایت</span>
          </button>
        </div>
      )}

      {/* Floating Inline Comment Composer Modal */}
      {commentComposer && onAddPassageComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
          <div
            className="fixed inset-0 bg-[#0F172A]/45 backdrop-blur-[2px]"
            onClick={() => setCommentComposer(null)}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = commentComposer.text.trim();
              if (!clean) return;
              onAddPassageComment({
                sectionId: commentComposer.sectionId,
                quote: commentComposer.quote,
                comment: clean,
              });
              setCommentComposer(null);
            }}
            className="elevation-tier-3 relative z-10 w-full max-w-[460px] rounded-2xl bg-white p-5 dark:bg-[#1C252E]"
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 dark:border-[#27323E]">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                <MessageSquarePlus className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
                <span>ثبت دیدگاه روی متن انتخاب‌شده</span>
              </div>
              <button
                type="button"
                onClick={() => setCommentComposer(null)}
                aria-label="بستن"
                className="rounded-md p-1 text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-lg border-r-3 border-[#0D9488] bg-[#F8FAFC] px-3 py-2 text-xs leading-6 text-[#475569] dark:border-[#2DD4BF] dark:bg-[#161D24] dark:text-[#CBD5E1]">
              <span className="line-clamp-3">«{commentComposer.quote}»</span>
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                دیدگاه یا نکته شخصی شما *
              </label>
              <textarea
                required
                autoFocus
                rows={4}
                value={commentComposer.text}
                onChange={(e) =>
                  setCommentComposer((prev) => (prev ? { ...prev, text: e.target.value } : null))
                }
                placeholder="توضیح، نکته امتحانی یا پرسش خود درباره این عبارت را بنویسید..."
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCommentComposer(null)}
                className="rounded-lg border border-[#CBD5E1] px-4 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1]"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D9488] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0F766E]"
              >
                ذخیره دیدگاه
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Floating Active Auto-Scroll Controller Pill */}
      {autoScrollActive && (
        <div className="elevation-tier-3 fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-xl border border-[#0D9488]/40 bg-white/95 px-3 py-2 text-xs backdrop-blur-sm dark:border-[#14B8A6]/45 dark:bg-[#1C252E]/95 no-print">
          <button
            type="button"
            onClick={() => setAutoScrollActive(false)}
            className="flex items-center gap-1 rounded-lg bg-[#0D9488] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0F766E]"
          >
            <Pause className="h-3 w-3" />
            <span>توقف</span>
          </button>
          <span className="font-mono text-[11px] font-semibold text-[#0F766E] tabular-nums dark:text-[#2DD4BF]">
            {autoScrollSpeed.toFixed(1)}x
          </span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={autoScrollSpeed}
            onChange={(e) => setAutoScrollSpeed(parseFloat(e.target.value))}
            aria-label="تنظیم سرعت اسکرول خودکار"
            className="w-24 accent-[#0D9488]"
          />
        </div>
      )}

      {/* Floating Quick Color Switcher immediately after instant highlighting */}
      {quickColorBar && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => {
            if (quickBarTimerRef.current !== null) {
              window.clearTimeout(quickBarTimerRef.current);
              quickBarTimerRef.current = null;
            }
          }}
          onMouseLeave={scheduleQuickBarDismiss}
          style={{
            left: `${quickColorBar.x}px`,
            top: `${quickColorBar.y}px`,
          }}
          className="elevation-tier-3 fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-2.5 py-1.5 dark:border-[#364554] dark:bg-[#1C252E] no-print"
        >
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#475569] dark:text-[#CBD5E1]">
            <Highlighter className="h-3.5 w-3.5 text-[#0D9488]" />
            <span>{quickColorBar.hasFormula ? 'رنگ فرمول:' : 'تغییر رنگ:'}</span>
          </span>
          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_SWATCHES.map((sw) => {
              const isCurrent = quickColorBar.color === sw.color;
              return (
                <button
                  key={sw.color}
                  type="button"
                  onClick={() => handleQuickRecolor(sw.color)}
                  title={`تغییر رنگ به ${sw.label}`}
                  aria-label={`تغییر رنگ به ${sw.label}`}
                  className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${sw.swatchBg} ${sw.ringColor} ${
                    isCurrent
                      ? 'scale-110 ring-2 ring-[#0D9488] ring-offset-1 dark:ring-[#2DD4BF] dark:ring-offset-[#1C252E]'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                />
              );
            })}
          </div>
          {onAddPassageComment && (
            <>
              <span className="h-4 w-px bg-[#E2E8F0] dark:bg-[#27323E]" />
              <button
                type="button"
                onClick={() => {
                  setCommentComposer({
                    quote: quickColorBar.quote,
                    sectionId: quickColorBar.sectionId,
                    text: '',
                  });
                  setQuickColorBar(null);
                }}
                title="افزودن دیدگاه روی این بخش"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#0F766E] transition-colors hover:bg-[#F0FDFA] dark:text-[#2DD4BF] dark:hover:bg-[#0F2928]"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                <span>دیدگاه</span>
              </button>
            </>
          )}
          <span className="h-4 w-px bg-[#E2E8F0] dark:bg-[#27323E]" />
          <button
            type="button"
            onClick={() => {
              onRemoveHighlight(quickColorBar.highlightId);
              setQuickColorBar(null);
            }}
            title="حذف این هایلایت"
            aria-label="حذف این هایلایت"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:hover:bg-[#450A0A]/40 dark:hover:text-[#F87171]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
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
          <aside
            className={`sticky hidden overflow-y-auto pl-2 transition-all duration-200 lg:block ${stickySidebarOffsetClass}`}
          >
            {syllabusContent}
          </aside>
        )}

        {/* Focal Archival Reading Sheet */}
        <main
          className={`elevation-tier-1 relative mx-auto w-full rounded-2xl bg-[#FAF9F6] px-6 py-7 transition-[max-width] duration-200 dark:bg-[#161D24] sm:px-10 sm:py-10 ${readingSheetWidthClass}`}
        >
          {/* Mirrored Minimal Vertical Reading Progress Bars on Both Card Borders */}
          {activeLesson.sections.length > 0 && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[3px] overflow-hidden rounded-r-2xl bg-[#E2E8F0]/55 dark:bg-[#27323E]/75 no-print"
              >
                <div
                  ref={rightProgressBarRef}
                  className="h-full w-full rounded-b-full bg-gradient-to-b from-[#0D9488]/75 to-[#0D9488] will-change-transform dark:from-[#14B8A6]/75 dark:to-[#2DD4BF]"
                  style={{ transform: `translate3d(0, ${-(100 - displayedProgressRef.current)}%, 0)` }}
                />
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] overflow-hidden rounded-l-2xl bg-[#E2E8F0]/55 dark:bg-[#27323E]/75 no-print"
              >
                <div
                  ref={leftProgressBarRef}
                  className="h-full w-full rounded-b-full bg-gradient-to-b from-[#0D9488]/75 to-[#0D9488] will-change-transform dark:from-[#14B8A6]/75 dark:to-[#2DD4BF]"
                  style={{ transform: `translate3d(0, ${-(100 - displayedProgressRef.current)}%, 0)` }}
                />
              </div>
            </>
          )}
          {/* Reader Layout & Highlight Controls Toolbar */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0]/70 pb-3 dark:border-[#27323E] no-print">
            <div className="flex flex-wrap items-center gap-2">
              <HoverTooltip
                label={rightSidebarOpen ? 'بستن سرفصل درس‌ها' : 'نمایش سرفصل درس‌ها'}
                placement="bottom"
                align="start"
                className="hidden lg:inline-flex"
              >
                <button
                  type="button"
                  onClick={onToggleRightSidebar}
                  aria-label={rightSidebarOpen ? 'بستن سرفصل درس‌ها' : 'نمایش سرفصل درس‌ها'}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    rightSidebarOpen
                      ? 'border-transparent text-[#64748B] hover:border-[#E2E8F0] hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]'
                      : 'border-[#0D9488]/30 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] dark:border-[#14B8A6]/35 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                  }`}
                >
                  {rightSidebarOpen ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                </button>
              </HoverTooltip>

              {/* Icon-Only Highlight Mode Toggle + Default Color Quick Switcher */}
              <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-1.5 py-1 dark:border-[#27323E] dark:bg-[#1C252E]">
                <HoverTooltip
                  label={
                    highlightModeEnabled
                      ? 'هایلایت روشن (کلیک برای خاموش کردن)'
                      : 'فعال‌سازی حالت هایلایت'
                  }
                  placement="bottom"
                  align="center"
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={highlightModeEnabled}
                    aria-label={
                      highlightModeEnabled ? 'خاموش کردن حالت هایلایت' : 'فعال‌سازی حالت هایلایت'
                    }
                    onClick={() => {
                      setHighlightModeEnabled((v) => !v);
                      setQuickColorBar(null);
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                      highlightModeEnabled
                        ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] ring-1 ring-[#0D9488]/25 dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF] dark:ring-[#14B8A6]/35'
                        : 'border-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E] dark:hover:text-[#F8FAFC]'
                    }`}
                  >
                    <Highlighter className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </HoverTooltip>

                <span className="h-4 w-px bg-[#E2E8F0] dark:bg-[#27323E]" aria-hidden="true" />

                <div
                  className="flex items-center gap-1.5 pl-0.5"
                  role="radiogroup"
                  aria-label="رنگ پیش‌فرض هایلایت"
                >
                  {HIGHLIGHT_SWATCHES.map((sw) => {
                    const isDefault = defaultHighlightColor === sw.color;
                    return (
                      <HoverTooltip
                        key={sw.color}
                        label={`رنگ هایلایت: ${sw.label}`}
                        placement="bottom"
                        align="center"
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={isDefault}
                          onClick={() => handleSelectToolbarHighlightColor(sw.color)}
                          aria-label={`رنگ پیش‌فرض ${sw.label}`}
                          className={`h-4.5 w-4.5 rounded-full border-2 transition-transform hover:scale-110 ${sw.swatchBg} ${sw.ringColor} ${
                            isDefault
                              ? 'scale-110 ring-2 ring-[#0D9488] ring-offset-1 dark:ring-[#2DD4BF] dark:ring-offset-[#1C252E]'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      </HoverTooltip>
                    );
                  })}
                </div>
              </div>
              {/* Auto-Scroll Control with Speed Presets & Slider */}
              {activeLesson.sections.length > 0 && (
                <div className="relative">
                  <div className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-1.5 py-1 dark:border-[#27323E] dark:bg-[#1C252E]">
                    <HoverTooltip label="تنظیم سرعت اسکرول خودکار" placement="bottom" align="center">
                      <button
                        type="button"
                        onClick={() => setAutoScrollPanelOpen((v) => !v)}
                        aria-label="تنظیم سرعت اسکرول خودکار"
                        className="flex h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] font-semibold text-[#0F766E] transition-colors hover:bg-[#F0FDFA] tabular-nums dark:text-[#2DD4BF] dark:hover:bg-[#0F2928]"
                      >
                        <Gauge className="h-3.5 w-3.5 shrink-0" />
                        <span>{autoScrollSpeed.toFixed(1)}x</span>
                      </button>
                    </HoverTooltip>
                    <span className="h-4 w-px bg-[#E2E8F0] dark:bg-[#27323E]" aria-hidden="true" />
                    <HoverTooltip
                      label={autoScrollActive ? 'توقف اسکرول خودکار' : 'شروع اسکرول خودکار'}
                      placement="bottom"
                      align="center"
                    >
                      <button
                        type="button"
                        onClick={() => setAutoScrollActive((v) => !v)}
                        aria-label={autoScrollActive ? 'توقف اسکرول خودکار' : 'شروع اسکرول خودکار'}
                        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                          autoScrollActive
                            ? 'bg-[#0D9488] text-white dark:bg-[#14B8A6] dark:text-[#0F172A]'
                            : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E] dark:hover:text-[#F8FAFC]'
                        }`}
                      >
                        {autoScrollActive ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5 -scale-x-100" />
                        )}
                      </button>
                    </HoverTooltip>
                  </div>

                  {autoScrollPanelOpen && (
                    <div className="elevation-tier-3 absolute right-0 top-full z-40 mt-2 w-60 rounded-xl bg-white p-3 dark:bg-[#1C252E]">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                          سرعت اسکرول خودکار
                        </span>
                        <span className="font-mono font-bold text-[#0D9488] tabular-nums dark:text-[#2DD4BF]">
                          {autoScrollSpeed.toFixed(1)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={4}
                        step={0.1}
                        value={autoScrollSpeed}
                        onChange={(e) => setAutoScrollSpeed(parseFloat(e.target.value))}
                        className="w-full accent-[#0D9488]"
                      />
                      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                        {AUTOSCROLL_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setAutoScrollSpeed(preset.speed)}
                            className={`rounded-lg border py-1 text-[11px] font-semibold transition-colors ${
                              Math.abs(autoScrollSpeed - preset.speed) < 0.15
                                ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                                : 'border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1] dark:border-[#27323E] dark:text-[#CBD5E1]'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#E2E8F0] pt-2.5 dark:border-[#27323E]">
                        <button
                          type="button"
                          onClick={() => {
                            setAutoScrollActive((v) => !v);
                            setAutoScrollPanelOpen(false);
                          }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#0D9488] py-1.5 text-xs font-semibold text-white hover:bg-[#0F766E]"
                        >
                          {autoScrollActive ? (
                            <>
                              <Pause className="h-3.5 w-3.5" />
                              <span>توقف</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5 -scale-x-100" />
                              <span>شروع حرکت</span>
                            </>
                          )}
                        </button>
                        <HoverTooltip label="بستن" placement="top" align="end">
                          <button
                            type="button"
                            onClick={() => setAutoScrollPanelOpen(false)}
                            aria-label="بستن"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:border-[#27323E] dark:text-[#94A3B8] dark:hover:bg-[#27323E] dark:hover:text-[#F8FAFC]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </HoverTooltip>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
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

              <HoverTooltip
                label={isFocusMode ? 'خروج از حالت تمرکز' : 'حالت تمرکز'}
                placement="bottom"
                align="center"
              >
                <button
                  type="button"
                  onClick={onToggleFocusMode}
                  aria-pressed={isFocusMode}
                  aria-label={isFocusMode ? 'خروج از حالت تمرکز' : 'حالت تمرکز'}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    isFocusMode
                      ? 'border-[#0D9488]/40 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] dark:border-[#14B8A6]/45 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                      : 'border-transparent text-[#64748B] hover:border-[#E2E8F0] hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]'
                  }`}
                >
                  <FocusTargetIcon className="h-[18px] w-[18px]" />
                </button>
              </HoverTooltip>

              <HoverTooltip
                label={leftSidebarOpen ? 'بستن فهرست مطالب' : 'نمایش فهرست مطالب'}
                placement="bottom"
                align="end"
                className="hidden lg:inline-flex"
              >
                <button
                  type="button"
                  onClick={onToggleLeftSidebar}
                  aria-label={leftSidebarOpen ? 'بستن فهرست مطالب' : 'نمایش فهرست مطالب'}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    leftSidebarOpen
                      ? 'border-transparent text-[#64748B] hover:border-[#E2E8F0] hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]'
                      : 'border-[#0D9488]/30 bg-[#F0FDFA] text-[#0F766E] hover:border-[#0D9488] dark:border-[#14B8A6]/35 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                  }`}
                >
                  {leftSidebarOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4" />
                  )}
                </button>
              </HoverTooltip>
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
                    <span aria-hidden="true" className="print-hide-meta">·</span>
                    <span className="tabular-nums print-hide-meta">{activeLesson.readingMinutes} دقیقه مطالعه</span>
                    <span aria-hidden="true" className="print-hide-meta">·</span>
                    <span className="print-hide-meta">{activeLesson.lastUpdated}</span>
                  </div>

                  <h1 className="mt-3 text-2xl font-bold leading-[1.45] tracking-tight text-[#0F172A] dark:text-[#F8FAFC] sm:text-[2.1rem]">
                    <RichMathText text={activeLesson.title} />
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
                  const isEditingThis = editingSectionId === section.id;
                  const isConfirmingDelete = confirmDeleteSectionId === section.id;

                  return (
                    <SectionScopeContext.Provider key={section.id} value={section.id}>
                      <section id={section.id} data-section-id={section.id} className="scroll-mt-28 space-y-5">
                      <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0]/70 pb-3 dark:border-[#27323E]">
                        <h2 className="flex items-baseline gap-2.5 text-xl font-semibold leading-9 text-[#0F172A] dark:text-[#F8FAFC] sm:text-[1.4rem]">
                          <span className="font-mono text-sm font-semibold text-[#0D9488] tabular-nums dark:text-[#2DD4BF]">
                            {section.number}
                          </span>
                          <span>
                            <RichMathText text={section.title} />
                          </span>
                        </h2>
                        <div className="mt-1 flex shrink-0 items-center gap-1 no-print">
                          {onUpdateSection && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteSectionId(null);
                                if (isEditingThis) {
                                  setEditingSectionId(null);
                                } else {
                                  setEditingSectionId(section.id);
                                  setEditSectionTitle(section.title);
                                  setEditSectionBody(
                                    section.markdownBody ?? section.paragraphs.join('\n\n')
                                  );
                                }
                              }}
                              title="ویرایش این بخش"
                              aria-label="ویرایش این بخش"
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                                isEditingThis
                                  ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                                  : 'border-transparent text-[#94A3B8] hover:border-[#E2E8F0] hover:bg-white hover:text-[#334155] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E]'
                              }`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {onDeleteSection && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSectionId(null);
                                setConfirmDeleteSectionId(isConfirmingDelete ? null : section.id);
                              }}
                              title="حذف این بخش"
                              aria-label="حذف این بخش"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-[#94A3B8] transition-colors hover:border-[#FCA5A5] hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:hover:border-[#991B1B] dark:hover:bg-[#7F1D1D]/30 dark:hover:text-[#F87171]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onToggleBookmark(sectionKey)}
                            title={isBookmarked ? 'حذف نشانه‌گذاری بخش' : 'نشانه‌گذاری این بخش'}
                            aria-label={isBookmarked ? 'حذف نشانه‌گذاری' : 'نشانه‌گذاری بخش'}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                              isBookmarked
                                ? 'border-[#FCD34D] bg-[#FFFBEB] text-[#D97706] dark:border-[#B45309]/50 dark:bg-[#451A03]/40 dark:text-[#FBBF24]'
                                : 'border-transparent text-[#94A3B8] hover:border-[#E2E8F0] hover:bg-white hover:text-[#334155] dark:hover:border-[#27323E] dark:hover:bg-[#1C252E]'
                            }`}
                          >
                            <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Inline Delete Confirmation for Section */}
                      {isConfirmingDelete && onDeleteSection && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#991B1B] dark:border-[#991B1B] dark:bg-[#7F1D1D]/25 dark:text-[#FCA5A5] no-print">
                          <span>آیا از حذف بخش «{section.title}» از این جزوه مطمئن هستید؟</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSectionId(null)}
                              className="rounded-lg bg-white px-3 py-1 font-medium text-[#334155] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                            >
                              انصراف
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteSection(activeLesson.id, section.id);
                                setConfirmDeleteSectionId(null);
                              }}
                              className="rounded-lg bg-[#DC2626] px-3 py-1 font-semibold text-white hover:bg-[#B91C1C]"
                            >
                              تایید حذف بخش
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline Section Editor */}
                      {isEditingThis && onUpdateSection ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!editSectionTitle.trim()) return;
                            onUpdateSection(activeLesson.id, section.id, {
                              title: editSectionTitle.trim(),
                              markdownBody: editSectionBody,
                            });
                            setEditingSectionId(null);
                          }}
                          className="space-y-3 rounded-xl border border-[#0D9488]/50 bg-white p-4 dark:border-[#14B8A6]/50 dark:bg-[#1C252E] no-print"
                        >
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1]">
                              عنوان بخش
                            </label>
                            <input
                              type="text"
                              required
                              value={editSectionTitle}
                              onChange={(e) => setEditSectionTitle(e.target.value)}
                              className="w-full rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-3 py-2 text-sm font-semibold text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-[#334155] dark:text-[#CBD5E1]">
                              متن بخش (پشتیبانی از Markdown و فرمول‌های LaTeX با $ و $$)
                            </label>
                            <textarea
                              rows={9}
                              value={editSectionBody}
                              onChange={(e) => setEditSectionBody(e.target.value)}
                              className="w-full rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-3 py-2 font-sans text-xs leading-7 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingSectionId(null)}
                              className="rounded-lg border border-[#CBD5E1] px-3.5 py-1.5 text-xs font-medium text-[#475569] dark:border-[#364554] dark:text-[#CBD5E1]"
                            >
                              انصراف
                            </button>
                            <button
                              type="submit"
                              className="flex items-center gap-1 rounded-lg bg-[#0D9488] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0F766E]"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>ذخیره تغییرات بخش</span>
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                      {/* Imported Markdown Body (Full RTL Markdown + KaTeX LaTeX) */}
                      {section.markdownBody && <MarkdownContent markdown={section.markdownBody} />}

                      {/* Structured Prose Paragraphs */}
                      {section.paragraphs.length > 0 && (
                        <div className="space-y-4">
                          {section.paragraphs.map((para, idx) => (
                            <p key={idx} className="lecture-paragraph leading-[2.0] text-[#1E293B] dark:text-[#CBD5E1]">
                              <RichMathText text={para} />
                            </p>
                          ))}
                        </div>
                      )}
                        </>
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

                {/* Add New Section Form / Button */}
                {onAddSection && (
                  <div className="pt-2 no-print">
                    {addingSection ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!newSectionTitle.trim()) return;
                          onAddSection(activeLesson.id, {
                            title: newSectionTitle.trim(),
                            markdownBody: newSectionBody,
                          });
                          setNewSectionTitle('');
                          setNewSectionBody('');
                          setAddingSection(false);
                        }}
                        className="space-y-3 rounded-xl border border-[#0D9488]/50 bg-white p-4 dark:border-[#14B8A6]/50 dark:bg-[#1C252E]"
                      >
                        <h3 className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                          افزودن بخش جدید به جزوه
                        </h3>
                        <input
                          type="text"
                          required
                          autoFocus
                          value={newSectionTitle}
                          onChange={(e) => setNewSectionTitle(e.target.value)}
                          placeholder="عنوان بخش جدید..."
                          className="w-full rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
                        />
                        <textarea
                          rows={6}
                          value={newSectionBody}
                          onChange={(e) => setNewSectionBody(e.target.value)}
                          placeholder="متن بخش با پشتیبانی از Markdown و فرمول‌های LaTeX..."
                          className="w-full rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-3 py-2 text-xs leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setAddingSection(false)}
                            className="rounded-lg border border-[#CBD5E1] px-3.5 py-1.5 text-xs font-medium text-[#475569] dark:border-[#364554] dark:text-[#CBD5E1]"
                          >
                            انصراف
                          </button>
                          <button
                            type="submit"
                            className="rounded-lg bg-[#0D9488] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0F766E]"
                          >
                            افزودن بخش
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingSection(true)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#CBD5E1] py-2.5 text-xs font-semibold text-[#64748B] transition-colors hover:border-[#0D9488] hover:bg-white/60 hover:text-[#0D9488] dark:border-[#364554] dark:text-[#94A3B8] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>افزودن بخش جدید به جزوه</span>
                      </button>
                    )}
                  </div>
                )}
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
                  <FlashcardIcon className="h-3.5 w-3.5" />
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
            ref={leftAsideRef}
            className={`sticky space-y-6 overflow-y-auto pr-2 transition-all duration-200 ${stickySidebarOffsetClass} ${
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
              <nav aria-label="فهرست مطالب" className="space-y-0.5 border-r border-[#E2E8F0] dark:border-[#27323E]">
                {tocSections.map(({ section, subheadings }) => {
                  const isExactActive = activeTocId === section.id;
                  const isParentOfActive = activeSectionId === section.id && !isExactActive;
                  const isBookmarked = bookmarkedSections.includes(`${activeLesson.id}:${section.id}`);

                  return (
                    <div key={section.id} className="space-y-0.5">
                      <button
                        ref={(el) => {
                          tocItemRefs.current[section.id] = el;
                        }}
                        type="button"
                        onClick={() => scrollToTarget(section.id)}
                        aria-current={isExactActive ? 'location' : undefined}
                        className={`-mr-px flex w-full items-center justify-between gap-2 border-r-2 py-1.5 pr-3 text-right text-xs leading-5 transition-colors ${
                          isExactActive
                            ? 'border-r-[#0D9488] bg-[#F0FDFA]/70 font-semibold text-[#0F766E] dark:border-r-[#2DD4BF] dark:bg-[#0F2928]/50 dark:text-[#2DD4BF]'
                            : isParentOfActive
                            ? 'border-r-[#0D9488]/45 font-semibold text-[#0F172A] dark:border-r-[#2DD4BF]/45 dark:text-[#F1F5F9]'
                            : 'border-r-transparent text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8] dark:hover:text-[#E2E8F0]'
                        }`}
                      >
                        <span className="truncate">
                          {section.number} {stripInlineMarkdown(section.title)}
                        </span>
                        {isBookmarked && (
                          <Bookmark className="h-3 w-3 shrink-0 fill-[#D97706] text-[#D97706]" />
                        )}
                      </button>

                      {subheadings.length > 0 && (
                        <div className="space-y-0.5">
                          {subheadings.map((sub) => {
                            const isSubActive = activeTocId === sub.id;
                            return (
                              <button
                                key={sub.id}
                                ref={(el) => {
                                  tocItemRefs.current[sub.id] = el;
                                }}
                                type="button"
                                onClick={() => scrollToTarget(sub.id)}
                                aria-current={isSubActive ? 'location' : undefined}
                                className={`-mr-px flex w-full items-center border-r-2 py-1 pr-6 text-right text-[11px] leading-5 transition-colors ${
                                  isSubActive
                                    ? 'border-r-[#0D9488] bg-[#F0FDFA]/70 font-semibold text-[#0F766E] dark:border-r-[#2DD4BF] dark:bg-[#0F2928]/50 dark:text-[#2DD4BF]'
                                    : 'border-r-transparent text-[#64748B]/90 hover:text-[#1E293B] dark:text-[#94A3B8]/85 dark:hover:text-[#E2E8F0]'
                                }`}
                              >
                                <span className="truncate">{sub.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
                <div className="flex items-center justify-between gap-2 border-t border-[#E2E8F0]/70 pt-2.5 dark:border-[#27323E]">
                  <dt className="text-[#64748B] dark:text-[#94A3B8]">زمان مطالعه ثبت‌شده</dt>
                  <dd className="font-semibold text-[#0F766E] tabular-nums dark:text-[#2DD4BF]">
                    {formatStudyDurationPersian(studySeconds)}
                  </dd>
                </div>
                {savedCheckpoint && (
                  <div className="rounded-lg border border-[#E2E8F0] bg-[#FAF9F6] p-2.5 dark:border-[#27323E] dark:bg-[#161D24]">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[#64748B] dark:text-[#94A3B8]">آخرین وضعیت مطالعه</span>
                      <span className="font-mono font-semibold text-[#0F766E] tabular-nums dark:text-[#2DD4BF]">
                        {Math.round(savedCheckpoint.progressPercent)}٪
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (savedCheckpoint.sectionId) {
                          scrollToTarget(savedCheckpoint.sectionId);
                        } else {
                          window.scrollTo({ top: savedCheckpoint.scrollY, behavior: 'smooth' });
                        }
                      }}
                      title="رفتن به آخرین زیربخش ثبت‌شده"
                      className="mt-1 block w-full truncate text-right text-[11px] font-semibold text-[#0F172A] transition-colors hover:text-[#0D9488] dark:text-[#E2E8F0] dark:hover:text-[#2DD4BF]"
                    >
                      {savedCheckpoint.sectionTitle}
                    </button>
                  </div>
                )}
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
                                scrollToTarget(hl.sectionId);
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

            {/* Inline Passage Comments Panel */}
            {lessonComments.length > 0 && (
              <div className="border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                    <MessageSquarePlus className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#2DD4BF]" />
                    <span>دیدگاه‌های متنی ({lessonComments.length})</span>
                  </h3>
                </div>
                <div className="space-y-2">
                  {lessonComments.map((item) => {
                    const isEditing = editingCommentId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="space-y-1.5 rounded-lg border border-[#E2E8F0] bg-[#FAF9F6] p-2.5 text-xs dark:border-[#27323E] dark:bg-[#161D24]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (item.sectionId === '__header__') {
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            } else if (item.sectionId) {
                              scrollToTarget(item.sectionId);
                            }
                          }}
                          className="block w-full border-r-2 border-[#0D9488]/60 pr-2 text-right text-[11px] leading-5 text-[#64748B] hover:text-[#0F766E] dark:border-[#2DD4BF]/60 dark:text-[#94A3B8] dark:hover:text-[#2DD4BF]"
                        >
                          <span className="line-clamp-2">«{item.quote}»</span>
                        </button>

                        {isEditing && onUpdatePassageComment ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!editCommentDraft.trim()) return;
                              onUpdatePassageComment(item.id, editCommentDraft.trim());
                              setEditingCommentId(null);
                            }}
                            className="space-y-1.5 pt-1"
                          >
                            <textarea
                              rows={3}
                              autoFocus
                              value={editCommentDraft}
                              onChange={(e) => setEditCommentDraft(e.target.value)}
                              className="w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1.5 text-xs leading-5 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F8FAFC]"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingCommentId(null)}
                                className="rounded px-2 py-0.5 text-[11px] text-[#64748B]"
                              >
                                لغو
                              </button>
                              <button
                                type="submit"
                                className="rounded bg-[#0D9488] px-2.5 py-0.5 text-[11px] font-semibold text-white"
                              >
                                ذخیره
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap leading-5 text-[#1E293B] dark:text-[#E2E8F0]">
                              {item.comment}
                            </p>
                            <div className="flex items-center justify-between pt-0.5 text-[10px] text-[#94A3B8]">
                              <span>{item.updatedAt ?? item.createdAt}</span>
                              <div className="flex items-center gap-1">
                                {onUpdatePassageComment && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCommentId(item.id);
                                      setEditCommentDraft(item.comment);
                                    }}
                                    title="ویرایش دیدگاه"
                                    className="rounded p-0.5 hover:text-[#0F766E] dark:hover:text-[#2DD4BF]"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                {onDeletePassageComment && (
                                  <button
                                    type="button"
                                    onClick={() => onDeletePassageComment(item.id)}
                                    title="حذف دیدگاه"
                                    className="rounded p-0.5 hover:text-[#DC2626]"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
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
