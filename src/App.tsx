/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CheckSquare, FileUp, FolderCog, Network } from 'lucide-react';
import {
  Course,
  Flashcard,
  FlashcardStatus,
  HighlightColor,
  Lesson,
  MindmapNode,
  PassageComment,
  QuizQuestion,
  ResourceKind,
  TextHighlight,
  ThemePreference,
  UserNote,
  WorkspaceMode,
} from './types/study';
import { Header } from './components/Header';
import { ArticleWorkspace, NewHighlightPayload } from './components/ArticleWorkspace';
import { MindmapWorkspace } from './components/MindmapWorkspace';
import { FlashcardWorkspace } from './components/FlashcardWorkspace';
import { QuizWorkspace } from './components/QuizWorkspace';
import {
  LiveReadingSnapshot,
  ReadingCheckpoint,
  useStudyTimer,
} from './components/StudyTimerWidget';
import { FlashcardIcon } from './components/icons/FlashcardIcon';
import {
  CreateCourseInput,
  CreateLessonInput,
  RenameLessonInput,
  ReplaceResourcePayload,
  ResourceManagerWorkspace,
} from './components/ResourceManagerWorkspace';
import { SearchModal, SearchNavigationTarget } from './components/SearchModal';
import { NotesDrawer } from './components/NotesDrawer';
import { ImportModal, LessonImportPayload } from './components/ImportModal';
import {
  makeUniqueId,
  normalizeHierarchy,
  reorderCoursesHierarchy,
  reorderSessionsHierarchy,
} from './utils/hierarchy';

const STORAGE_KEYS = {
  themeMode: 'archival_scholar_theme_mode',
  fontScale: 'archival_scholar_font_scale',
  cardStatuses: 'archival_scholar_fc_statuses',
  customCards: 'archival_scholar_custom_cards',
  bookmarks: 'jadarsi_bookmarks_v2',
  notes: 'jadarsi_notes_v2',
  quizScores: 'archival_scholar_quiz_scores',
  courses: 'jadarsi_courses_v1',
  lessons: 'jadarsi_lessons_v2',
  legacyLessons: 'archival_scholar_lessons_v1',
  rightSidebar: 'archival_scholar_right_sidebar',
  leftSidebar: 'archival_scholar_left_sidebar',
  highlights: 'archival_scholar_highlights_v1',
  passageComments: 'jadarsi_passage_comments_v1',
  studyTime: 'jadarsi_study_time_v1',
  studyCheckpoints: 'jadarsi_study_checkpoints_v1',
  scrollPositions: 'jadarsi_scroll_positions_v1',
};

const LEGACY_SAMPLE_IDS = new Set([
  'thermodynamics-entropy',
  'algorithms-recurrence',
  'linear-algebra-svd',
  'biochemistry-kinetics',
]);

function readInitialLessons(): Lesson[] {
  const savedV2 = readStorage<Lesson[] | null>(STORAGE_KEYS.lessons, null);
  if (Array.isArray(savedV2)) return savedV2;

  // One-time migration: preserve only user-created custom lessons, never built-in samples
  const legacy = readStorage<Lesson[] | null>(STORAGE_KEYS.legacyLessons, null);
  if (Array.isArray(legacy)) {
    return legacy
      .filter((l) => l && l.isCustom === true && !LEGACY_SAMPLE_IDS.has(l.id))
      .map((l, idx) => ({ ...l, chapterNumber: idx + 1 }));
  }

  return [];
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function removeScrollPositions(lessonIds: string[]) {
  if (lessonIds.length === 0) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.scrollPositions);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, number>;
    let changed = false;
    for (const id of lessonIds) {
      if (id in map) {
        delete map[id];
        changed = true;
      }
    }
    if (changed) {
      window.localStorage.setItem(STORAGE_KEYS.scrollPositions, JSON.stringify(map));
    }
  } catch {
    // ignore storage quota errors
  }
}

function readInitialCoursesAndLessons(): { courses: Course[]; lessons: Lesson[] } {
  const initialLessons = readInitialLessons();
  const savedCourses = readStorage<Course[] | null>(STORAGE_KEYS.courses, null);
  const today = todayPersianDate();

  if (Array.isArray(savedCourses)) {
    return normalizeHierarchy(savedCourses, initialLessons, today);
  }

  // First time migrating existing user lessons into Courses (never creates sample data if empty)
  if (initialLessons.length === 0) {
    return { courses: [], lessons: [] };
  }

  return normalizeHierarchy([], initialLessons, today);
}

function estimateReadingMinutesFromSections(sections: Lesson['sections']): number {
  const totalWords = sections.reduce((sum, s) => {
    const body = s.markdownBody || s.paragraphs.join(' ');
    const words = `${s.title} ${body}`.trim().split(/\s+/).filter(Boolean).length;
    return sum + words;
  }, 0);
  if (totalWords === 0) return 0;
  return Math.max(1, Math.round(totalWords / 180));
}

function readThemePreference(): ThemePreference {
  const stored = readStorage<string | null>(STORAGE_KEYS.themeMode, null);
  if (
    stored === 'system' ||
    stored === 'light' ||
    stored === 'eye-comfort' ||
    stored === 'sage' ||
    stored === 'dark' ||
    stored === 'midnight'
  ) {
    return stored;
  }
  return 'system';
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function createEmptyMindmapNode(lessonId: string, title: string): MindmapNode {
  return {
    id: `empty-mm-${lessonId}-${Date.now().toString(36).slice(-4)}`,
    title,
    subtitle: 'بدون مایندمپ',
    summary:
      'هنوز فایل مایندمپ (.json) برای این جلسه ثبت نشده است. از بخش «مدیریت منابع» فایل مایندمپ را بارگذاری کنید.',
  };
}

function todayPersianDate(): string {
  return new Date().toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function App() {
  const initialHierarchy = useMemo(() => readInitialCoursesAndLessons(), []);
  const [courses, setCourses] = useState<Course[]>(() => initialHierarchy.courses);
  const [lessons, setLessons] = useState<Lesson[]>(() => initialHierarchy.lessons);

  const [activeLessonId, setActiveLessonId] = useState<string | null>(() => lessons[0]?.id ?? null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('notes');
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readThemePreference());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPrefersDark());
  const [fontScale, setFontScale] = useState<number>(() => readStorage(STORAGE_KEYS.fontScale, 0));

  const isDark =
    themePreference === 'dark' ||
    themePreference === 'midnight' ||
    (themePreference === 'system' && systemPrefersDark);

  // Persistent collapsible sidebar states for the Lecture Note view
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(() =>
    readStorage(STORAGE_KEYS.rightSidebar, true)
  );
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(() =>
    readStorage(STORAGE_KEYS.leftSidebar, true)
  );

  const [cardStatuses, setCardStatuses] = useState<Record<string, FlashcardStatus>>(() =>
    readStorage(STORAGE_KEYS.cardStatuses, {})
  );
  const [customCardsByLesson, setCustomCardsByLesson] = useState<Record<string, Flashcard[]>>(() =>
    readStorage(STORAGE_KEYS.customCards, {})
  );
  const [bookmarkedSections, setBookmarkedSections] = useState<string[]>(() =>
    readStorage(STORAGE_KEYS.bookmarks, [])
  );
  const [userNotes, setUserNotes] = useState<UserNote[]>(() =>
    readStorage(STORAGE_KEYS.notes, [])
  );
  const [quizBestScores, setQuizBestScores] = useState<Record<string, number>>(() =>
    readStorage(STORAGE_KEYS.quizScores, {})
  );
  const [highlights, setHighlights] = useState<TextHighlight[]>(() =>
    readStorage(STORAGE_KEYS.highlights, [])
  );
  const [passageComments, setPassageComments] = useState<PassageComment[]>(() =>
    readStorage(STORAGE_KEYS.passageComments, [])
  );
  const [studySecondsByLesson, setStudySecondsByLesson] = useState<Record<string, number>>(() =>
    readStorage(STORAGE_KEYS.studyTime, {})
  );
  const [studyCheckpointsByLesson, setStudyCheckpointsByLesson] = useState<
    Record<string, ReadingCheckpoint>
  >(() => readStorage(STORAGE_KEYS.studyCheckpoints, {}));
  const [liveReadingSnapshot, setLiveReadingSnapshot] = useState<LiveReadingSnapshot | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [mobileSyllabusOpen, setMobileSyllabusOpen] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);
  const [focusMindmapNodeId, setFocusMindmapNodeId] = useState<string | null>(null);
  const [focusFlashcardId, setFocusFlashcardId] = useState<string | null>(null);
  const [focusQuizQuestionId, setFocusQuizQuestionId] = useState<string | null>(null);

  const activeLesson = useMemo<Lesson | null>(
    () => lessons.find((l) => l.id === activeLessonId) ?? lessons[0] ?? null,
    [lessons, activeLessonId]
  );

  const isFullFocusMode =
    workspaceMode === 'notes' &&
    Boolean(activeLesson) &&
    headerCollapsed &&
    !rightSidebarOpen &&
    !leftSidebarOpen;

  // Manual-only study timer: never auto-starts or auto-increments on lesson open.
  const studyTimer = useStudyTimer();

  const handleSaveStudySession = useCallback(
    (elapsedSeconds: number) => {
      if (!activeLesson || elapsedSeconds <= 0) return;
      const lessonId = activeLesson.id;

      // 1. Add elapsed study seconds & persist immediately
      setStudySecondsByLesson((prev) => {
        const next = {
          ...prev,
          [lessonId]: (prev[lessonId] ?? 0) + elapsedSeconds,
        };
        try {
          window.localStorage.setItem(STORAGE_KEYS.studyTime, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });

      // 2. Sync & persist current reading position + active subsection checkpoint
      const currentSnapshot =
        liveReadingSnapshot && liveReadingSnapshot.lessonId === lessonId
          ? liveReadingSnapshot
          : null;
      const scrollY =
        workspaceMode === 'notes'
          ? Math.max(0, Math.round(window.scrollY))
          : currentSnapshot?.scrollY ?? 0;

      const checkpoint: ReadingCheckpoint = {
        sectionId: currentSnapshot?.sectionId ?? activeLesson.sections[0]?.id ?? '',
        sectionTitle:
          currentSnapshot?.sectionTitle ?? activeLesson.sections[0]?.title ?? activeLesson.title,
        progressPercent: currentSnapshot?.progressPercent ?? 0,
        scrollY,
        savedAt: todayPersianDate(),
      };

      setStudyCheckpointsByLesson((prev) => {
        const next = { ...prev, [lessonId]: checkpoint };
        try {
          window.localStorage.setItem(STORAGE_KEYS.studyCheckpoints, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
        return next;
      });

      // Also sync scroll position map so reopening the lesson restores this exact point
      try {
        const raw = window.localStorage.getItem(STORAGE_KEYS.scrollPositions);
        const scrollMap = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        scrollMap[lessonId] = scrollY;
        window.localStorage.setItem(STORAGE_KEYS.scrollPositions, JSON.stringify(scrollMap));
      } catch {
        // ignore storage quota errors
      }
    },
    [activeLesson, liveReadingSnapshot, workspaceMode]
  );

  // Listen dynamically to OS/browser prefers-color-scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    setSystemPrefersDark(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  // Sync Tailwind dark class + Eye-Friendly theme classes, colorScheme, and persist preference
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.classList.toggle('theme-eye-comfort', themePreference === 'eye-comfort');
    root.classList.toggle('theme-sage', themePreference === 'sage');
    root.classList.toggle('theme-midnight', themePreference === 'midnight');
    root.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem(STORAGE_KEYS.themeMode, JSON.stringify(themePreference));
    } catch {
      // ignore storage quota errors
    }
  }, [isDark, themePreference]);

  // Persist user preferences, sidebar states, courses, lessons, and study progress
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.fontScale, JSON.stringify(fontScale));
      window.localStorage.setItem(STORAGE_KEYS.rightSidebar, JSON.stringify(rightSidebarOpen));
      window.localStorage.setItem(STORAGE_KEYS.leftSidebar, JSON.stringify(leftSidebarOpen));
      window.localStorage.setItem(STORAGE_KEYS.cardStatuses, JSON.stringify(cardStatuses));
      window.localStorage.setItem(STORAGE_KEYS.customCards, JSON.stringify(customCardsByLesson));
      window.localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(bookmarkedSections));
      window.localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(userNotes));
      window.localStorage.setItem(STORAGE_KEYS.quizScores, JSON.stringify(quizBestScores));
      window.localStorage.setItem(STORAGE_KEYS.courses, JSON.stringify(courses));
      window.localStorage.setItem(STORAGE_KEYS.lessons, JSON.stringify(lessons));
      window.localStorage.setItem(STORAGE_KEYS.highlights, JSON.stringify(highlights));
      window.localStorage.setItem(STORAGE_KEYS.passageComments, JSON.stringify(passageComments));
    } catch {
      // ignore storage quota errors
    }
  }, [
    fontScale,
    rightSidebarOpen,
    leftSidebarOpen,
    cardStatuses,
    customCardsByLesson,
    bookmarkedSections,
    userNotes,
    quizBestScores,
    courses,
    lessons,
    highlights,
    passageComments,
  ]);

  // Persist per-lesson study duration & checkpoints immediately when updated
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.studyTime, JSON.stringify(studySecondsByLesson));
      window.localStorage.setItem(
        STORAGE_KEYS.studyCheckpoints,
        JSON.stringify(studyCheckpointsByLesson)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [studySecondsByLesson, studyCheckpointsByLesson]);

  // Global keyboard shortcut: Ctrl/Cmd + K for Search (capture phase + supports Persian keyboard layout)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK =
        e.code === 'KeyK' ||
        e.key.toLowerCase() === 'k' ||
        e.key === 'ن';
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && isK) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const activeLessonCards = useMemo(() => {
    if (!activeLesson) return [];
    const custom = customCardsByLesson[activeLesson.id] ?? [];
    return [...activeLesson.flashcards, ...custom];
  }, [activeLesson, customCardsByLesson]);

  // Calculate per-lesson mastery percentage combining flashcards mastered + quiz best score
  const lessonMasteryMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const lesson of lessons) {
      const cards = [...lesson.flashcards, ...(customCardsByLesson[lesson.id] ?? [])];
      const mastered = cards.filter((c) => cardStatuses[c.id] === 'mastered').length;
      const fcPct = cards.length > 0 ? (mastered / cards.length) * 100 : 0;
      const qPct = quizBestScores[lesson.id];
      if (qPct !== undefined && mastered > 0) {
        map[lesson.id] = Math.round((fcPct + qPct) / 2);
      } else if (qPct !== undefined) {
        map[lesson.id] = Math.round(qPct);
      } else {
        map[lesson.id] = Math.round(fcPct);
      }
    }
    return map;
  }, [lessons, cardStatuses, customCardsByLesson, quizBestScores]);

  const handleAdjustFontScale = (delta: number) => {
    setFontScale((prev) => Math.max(-2, Math.min(3, prev + delta)));
  };

  const handleToggleHeaderCollapsed = useCallback(() => {
    setHeaderCollapsed((prev) => !prev);
  }, []);

  const handleToggleFocusMode = useCallback(() => {
    if (headerCollapsed && !rightSidebarOpen && !leftSidebarOpen) {
      setHeaderCollapsed(false);
      setRightSidebarOpen(true);
      setLeftSidebarOpen(true);
    } else {
      setHeaderCollapsed(true);
      setRightSidebarOpen(false);
      setLeftSidebarOpen(false);
    }
  }, [headerCollapsed, rightSidebarOpen, leftSidebarOpen]);

  const handleExitFocusMode = useCallback(() => {
    setHeaderCollapsed(false);
    setRightSidebarOpen(true);
    setLeftSidebarOpen(true);
  }, []);

  // Allow pressing Escape to exit Full Focus Mode when no modal/drawer is open
  useEffect(() => {
    if (!isFullFocusMode) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !searchOpen && !drawerOpen && !importModalOpen && !mobileSyllabusOpen) {
        handleExitFocusMode();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isFullFocusMode, searchOpen, drawerOpen, importModalOpen, mobileSyllabusOpen, handleExitFocusMode]);

  const handleToggleBookmark = (sectionKey: string) => {
    setBookmarkedSections((prev) =>
      prev.includes(sectionKey) ? prev.filter((k) => k !== sectionKey) : [...prev, sectionKey]
    );
  };

  const handleJumpToSection = useCallback((sectionId: string) => {
    setWorkspaceMode('notes');
    setFocusSectionId(sectionId);
  }, []);

  const handleJumpToLessonSection = useCallback((lessonId: string, sectionId: string) => {
    setActiveLessonId(lessonId);
    setWorkspaceMode('notes');
    setFocusSectionId(sectionId);
  }, []);

  const handleClearFocusSection = useCallback(() => {
    setFocusSectionId(null);
  }, []);

  const handleClearFocusMindmapNode = useCallback(() => {
    setFocusMindmapNodeId(null);
  }, []);

  const handleClearFocusFlashcard = useCallback(() => {
    setFocusFlashcardId(null);
  }, []);

  const handleClearFocusQuizQuestion = useCallback(() => {
    setFocusQuizQuestionId(null);
  }, []);

  const handleUpdateCardStatus = (cardId: string, status: FlashcardStatus) => {
    setCardStatuses((prev) => ({ ...prev, [cardId]: status }));
  };

  const handleResetLessonCardStatuses = (cardIds: string[]) => {
    setCardStatuses((prev) => {
      const next = { ...prev };
      for (const id of cardIds) delete next[id];
      return next;
    });
  };

  const handleAddCustomCard = (card: Omit<Flashcard, 'id' | 'isCustom'>) => {
    if (!activeLesson) return;
    const newCard: Flashcard = {
      ...card,
      id: `custom-${Date.now()}`,
      isCustom: true,
    };
    setCustomCardsByLesson((prev) => ({
      ...prev,
      [activeLesson.id]: [...(prev[activeLesson.id] ?? []), newCard],
    }));
  };

  const handleAddNote = (lessonId: string, title: string, content: string, sectionId?: string) => {
    const now = new Date();
    const timestamp = now.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const note: UserNote = {
      id: `note-${Date.now()}`,
      lessonId,
      sectionId,
      title,
      content,
      createdAt: timestamp,
    };
    setUserNotes((prev) => [note, ...prev]);
  };

  const handleDeleteNote = (noteId: string) => {
    setUserNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const handleSaveQuizBestScore = useCallback((lessonId: string, scorePercent: number) => {
    setQuizBestScores((prev) => {
      const existing = prev[lessonId] ?? 0;
      if (scorePercent <= existing) return prev;
      return { ...prev, [lessonId]: scorePercent };
    });
  }, []);

  const handleApplyImport = (payload: LessonImportPayload) => {
    const todayFa = todayPersianDate();

    if (payload.mode === 'update') {
      if (!activeLesson) return;
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== activeLesson.id) return lesson;
          return {
            ...lesson,
            lastUpdated: todayFa,
            ...(payload.markdown
              ? {
                  sections: payload.markdown.sections,
                  readingMinutes: payload.markdown.readingMinutes,
                  summary: payload.markdown.summary ?? lesson.summary,
                  subtitle: payload.markdown.subtitle ?? lesson.subtitle,
                }
              : {}),
            ...(payload.flashcards ? { flashcards: payload.flashcards } : {}),
            ...(payload.quiz ? { quiz: payload.quiz.questions } : {}),
            ...(payload.mindmap ? { mindmap: payload.mindmap.root } : {}),
          };
        })
      );
      return;
    }

    // Create a brand new Session strictly attached to an existing Course OR a newly created distinct Course
    const newId = makeUniqueId('lesson');
    let nextCourses = courses;
    let resolvedCourseId: string | undefined = payload.createNewCourse ? undefined : payload.courseId;
    let resolvedCourseName = payload.course.trim() || 'درس جدید';

    if (resolvedCourseId) {
      const matched = courses.find((c) => c.id === resolvedCourseId);
      if (matched) {
        resolvedCourseName = matched.name;
      } else {
        resolvedCourseId = undefined;
      }
    }

    if (!resolvedCourseId) {
      // Explicitly create a distinct top-level Course rather than merging into an existing one
      const createdCourse: Course = {
        id: makeUniqueId('course'),
        name: resolvedCourseName,
        createdAt: todayFa,
      };
      resolvedCourseId = createdCourse.id;
      nextCourses = [...courses, createdCourse];
    }

    const existingSessionsInCourse = lessons.filter((l) => l.courseId === resolvedCourseId).length;

    const newLesson: Lesson = {
      id: newId,
      chapterNumber: existingSessionsInCourse + 1,
      code: payload.code,
      course: resolvedCourseName,
      courseId: resolvedCourseId,
      title: payload.title,
      subtitle:
        payload.markdown?.subtitle ??
        payload.mindmap?.subtitle ??
        payload.quiz?.description ??
        '',
      readingMinutes: payload.markdown?.readingMinutes ?? 0,
      lastUpdated: todayFa,
      author: 'کتابخانه شخصی جادرسی',
      summary: payload.markdown?.summary ?? payload.quiz?.description ?? '',
      sections: payload.markdown?.sections ?? [],
      mindmap: payload.mindmap?.root ?? createEmptyMindmapNode(newId, payload.title),
      flashcards: payload.flashcards ?? [],
      quiz: payload.quiz?.questions ?? [],
      isCustom: true,
    };

    const normalized = normalizeHierarchy(nextCourses, [...lessons, newLesson], todayFa);
    setCourses(normalized.courses);
    setLessons(normalized.lessons);
    setActiveLessonId(newLesson.id);

    // Jump directly to the most relevant tab that received content
    if (payload.markdown) setWorkspaceMode('notes');
    else if (payload.mindmap) setWorkspaceMode('mindmap');
    else if (payload.flashcards) setWorkspaceMode('flashcards');
    else if (payload.quiz) setWorkspaceMode('quiz');
    else setWorkspaceMode('notes');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteLesson = useCallback(
    (lessonId: string) => {
      const normalized = normalizeHierarchy(
        courses,
        lessons.filter((l) => l.id !== lessonId),
        todayPersianDate()
      );
      setLessons(normalized.lessons);
      if (activeLessonId === lessonId) {
        setActiveLessonId(normalized.lessons[0]?.id ?? null);
      }
      removeScrollPositions([lessonId]);
      setCustomCardsByLesson((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
      setUserNotes((prev) => prev.filter((n) => n.lessonId !== lessonId));
      setHighlights((prev) => prev.filter((h) => h.lessonId !== lessonId));
      setPassageComments((prev) => prev.filter((c) => c.lessonId !== lessonId));
      setBookmarkedSections((prev) => prev.filter((k) => !k.startsWith(`${lessonId}:`)));
      setQuizBestScores((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
      setStudySecondsByLesson((prev) => {
        if (!(lessonId in prev)) return prev;
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
      setStudyCheckpointsByLesson((prev) => {
        if (!(lessonId in prev)) return prev;
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
    },
    [courses, lessons, activeLessonId]
  );

  const handleCreateCourse = useCallback((input: CreateCourseInput): string => {
    const id = makeUniqueId('course');
    const nextCourse: Course = {
      id,
      name: input.name.trim(),
      code: input.code?.trim() || undefined,
      createdAt: todayPersianDate(),
    };
    setCourses((prev) => [...prev, nextCourse]);
    return id;
  }, []);

  const handleRenameCourse = useCallback((courseId: string, input: CreateCourseInput) => {
    const trimmedName = input.name.trim();
    if (!trimmedName) return;
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId ? { ...c, name: trimmedName, code: input.code?.trim() || undefined } : c
      )
    );
    setLessons((prev) =>
      prev.map((l) => (l.courseId === courseId ? { ...l, course: trimmedName } : l))
    );
  }, []);

  const handleDeleteCourse = useCallback(
    (courseId: string) => {
      const removedLessonIds = new Set(
        lessons.filter((l) => l.courseId === courseId).map((l) => l.id)
      );
      const nextCourses = courses.filter((c) => c.id !== courseId);
      const normalized = normalizeHierarchy(
        nextCourses,
        lessons.filter((l) => !removedLessonIds.has(l.id)),
        todayPersianDate()
      );
      setCourses(normalized.courses);
      setLessons(normalized.lessons);
      if (activeLessonId && removedLessonIds.has(activeLessonId)) {
        setActiveLessonId(normalized.lessons[0]?.id ?? null);
      }
      if (removedLessonIds.size > 0) {
        removeScrollPositions(Array.from(removedLessonIds));
        setCustomCardsByLesson((prev) => {
          const next = { ...prev };
          removedLessonIds.forEach((id) => delete next[id]);
          return next;
        });
        setUserNotes((prev) => prev.filter((n) => !removedLessonIds.has(n.lessonId)));
        setHighlights((prev) => prev.filter((h) => !removedLessonIds.has(h.lessonId)));
        setPassageComments((prev) => prev.filter((c) => !removedLessonIds.has(c.lessonId)));
        setBookmarkedSections((prev) =>
          prev.filter((k) => !removedLessonIds.has(k.split(':')[0] ?? ''))
        );
        setQuizBestScores((prev) => {
          const next = { ...prev };
          removedLessonIds.forEach((id) => delete next[id]);
          return next;
        });
        setStudySecondsByLesson((prev) => {
          const next = { ...prev };
          removedLessonIds.forEach((id) => delete next[id]);
          return next;
        });
        setStudyCheckpointsByLesson((prev) => {
          const next = { ...prev };
          removedLessonIds.forEach((id) => delete next[id]);
          return next;
        });
      }
    },
    [courses, lessons, activeLessonId]
  );

  const handleReorderCourses = useCallback(
    (dragCourseId: string, targetCourseId: string) => {
      const result = reorderCoursesHierarchy(
        courses,
        lessons,
        dragCourseId,
        targetCourseId,
        todayPersianDate()
      );
      setCourses(result.courses);
      setLessons(result.lessons);
    },
    [courses, lessons]
  );

  const handleReorderLessons = useCallback(
    (dragLessonId: string, targetLessonId: string | null, targetCourseId?: string) => {
      const result = reorderSessionsHierarchy(
        courses,
        lessons,
        dragLessonId,
        targetLessonId,
        targetCourseId,
        todayPersianDate()
      );
      setLessons(result.lessons);
    },
    [courses, lessons]
  );

  const handleCreateLesson = useCallback(
    (input: CreateLessonInput): string => {
      const today = todayPersianDate();
      const newId = makeUniqueId('lesson');

      let nextCourses = courses;
      let resolvedCourseId: string | undefined = input.createNewCourse ? undefined : input.courseId;
      let resolvedCourseName = input.course.trim() || 'درس جدید';

      if (resolvedCourseId) {
        const existing = courses.find((c) => c.id === resolvedCourseId);
        if (existing) {
          resolvedCourseName = existing.name;
        } else {
          resolvedCourseId = undefined;
        }
      }

      if (!resolvedCourseId) {
        const createdCourse: Course = {
          id: makeUniqueId('course'),
          name: resolvedCourseName,
          createdAt: today,
        };
        resolvedCourseId = createdCourse.id;
        nextCourses = [...courses, createdCourse];
      }

      const existingSessionsInCourse = lessons.filter((l) => l.courseId === resolvedCourseId).length;

      const newLesson: Lesson = {
        id: newId,
        chapterNumber: existingSessionsInCourse + 1,
        code: input.code,
        course: resolvedCourseName,
        courseId: resolvedCourseId,
        title: input.title,
        subtitle: '',
        readingMinutes: 0,
        lastUpdated: today,
        author: 'کتابخانه شخصی جادرسی',
        summary: '',
        sections: [],
        mindmap: createEmptyMindmapNode(newId, input.title),
        flashcards: [],
        quiz: [],
        isCustom: true,
      };

      const normalized = normalizeHierarchy(nextCourses, [...lessons, newLesson], today);
      setCourses(normalized.courses);
      setLessons(normalized.lessons);
      return newId;
    },
    [courses, lessons]
  );

  const handleRenameLesson = useCallback(
    (lessonId: string, input: RenameLessonInput) => {
      const today = todayPersianDate();
      const matchedCourse = input.courseId
        ? courses.find((c) => c.id === input.courseId)
        : undefined;
      const updatedLessons = lessons.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              title: input.title,
              course: matchedCourse ? matchedCourse.name : input.course,
              courseId: matchedCourse ? matchedCourse.id : l.courseId,
              code: input.code,
              lastUpdated: today,
            }
          : l
      );
      const normalized = normalizeHierarchy(courses, updatedLessons, today);
      setLessons(normalized.lessons);
    },
    [courses, lessons]
  );

  const handleReplaceResource = useCallback(
    (lessonId: string, payload: ReplaceResourcePayload) => {
      const today = todayPersianDate();
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          const labels = { ...(lesson.resourceLabels ?? {}) };

          if (payload.kind === 'lecture' && payload.markdown) {
            if (payload.fileName) labels.lecture = payload.fileName;
            return {
              ...lesson,
              lastUpdated: today,
              sections: payload.markdown.sections,
              readingMinutes: payload.markdown.readingMinutes,
              summary: payload.markdown.summary ?? lesson.summary,
              subtitle: payload.markdown.subtitle ?? lesson.subtitle,
              resourceLabels: labels,
            };
          }

          if (payload.kind === 'mindmap' && payload.mindmap) {
            if (payload.fileName) labels.mindmap = payload.fileName;
            return {
              ...lesson,
              lastUpdated: today,
              mindmap: payload.mindmap.root,
              resourceLabels: labels,
            };
          }

          if (payload.kind === 'flashcards' && payload.flashcards) {
            if (payload.fileName) labels.flashcards = payload.fileName;
            return {
              ...lesson,
              lastUpdated: today,
              flashcards: payload.append
                ? [...lesson.flashcards, ...payload.flashcards]
                : payload.flashcards,
              resourceLabels: labels,
            };
          }

          if (payload.kind === 'quiz' && payload.quiz) {
            if (payload.fileName) labels.quiz = payload.fileName;
            return {
              ...lesson,
              lastUpdated: today,
              quiz: payload.append
                ? [...lesson.quiz, ...payload.quiz.questions]
                : payload.quiz.questions,
              resourceLabels: labels,
            };
          }

          return lesson;
        })
      );
    },
    []
  );

  const handleRenameResource = useCallback(
    (lessonId: string, kind: ResourceKind, newLabel: string) => {
      const today = todayPersianDate();
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          return {
            ...lesson,
            lastUpdated: today,
            resourceLabels: {
              ...(lesson.resourceLabels ?? {}),
              [kind]: newLabel,
            },
            ...(kind === 'mindmap'
              ? {
                  mindmap: {
                    ...lesson.mindmap,
                    title: newLabel,
                  },
                }
              : {}),
          };
        })
      );
    },
    []
  );

  const handleRenameSection = useCallback(
    (lessonId: string, sectionId: string, newTitle: string) => {
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          return {
            ...lesson,
            sections: lesson.sections.map((s) =>
              s.id === sectionId ? { ...s, title: newTitle } : s
            ),
          };
        })
      );
    },
    []
  );

  const handleMoveResource = useCallback(
    (
      fromLessonId: string,
      toLessonId: string,
      kind: ResourceKind,
      strategy: 'replace' | 'append'
    ) => {
      if (fromLessonId === toLessonId) return;
      const today = todayPersianDate();

      if (kind === 'flashcards') {
        const sourceCustom = customCardsByLesson[fromLessonId] ?? [];
        if (sourceCustom.length > 0) {
          setCustomCardsByLesson((prev) => {
            const next = { ...prev };
            const moved = prev[fromLessonId] ?? [];
            delete next[fromLessonId];
            next[toLessonId] =
              strategy === 'append' ? [...(prev[toLessonId] ?? []), ...moved] : moved;
            return next;
          });
        }
      }

      setLessons((prev) => {
        const source = prev.find((l) => l.id === fromLessonId);
        const target = prev.find((l) => l.id === toLessonId);
        if (!source || !target) return prev;

        return prev.map((lesson) => {
          if (lesson.id === fromLessonId) {
            const nextLabels = { ...(lesson.resourceLabels ?? {}) };
            delete nextLabels[kind];

            if (kind === 'lecture') {
              return {
                ...lesson,
                lastUpdated: today,
                sections: [],
                readingMinutes: 0,
                summary: '',
                resourceLabels: nextLabels,
              };
            }
            if (kind === 'mindmap') {
              return {
                ...lesson,
                lastUpdated: today,
                mindmap: createEmptyMindmapNode(lesson.id, lesson.title),
                resourceLabels: nextLabels,
              };
            }
            if (kind === 'flashcards') {
              return {
                ...lesson,
                lastUpdated: today,
                flashcards: [],
                resourceLabels: nextLabels,
              };
            }
            if (kind === 'quiz') {
              return {
                ...lesson,
                lastUpdated: today,
                quiz: [],
                resourceLabels: nextLabels,
              };
            }
          }

          if (lesson.id === toLessonId) {
            const nextLabels = { ...(lesson.resourceLabels ?? {}) };
            const movedLabel = source.resourceLabels?.[kind];
            if (movedLabel) nextLabels[kind] = movedLabel;

            if (kind === 'lecture') {
              return {
                ...lesson,
                lastUpdated: today,
                sections: source.sections,
                readingMinutes: source.readingMinutes,
                summary: source.summary || lesson.summary,
                resourceLabels: nextLabels,
              };
            }
            if (kind === 'mindmap') {
              return {
                ...lesson,
                lastUpdated: today,
                mindmap: source.mindmap,
                resourceLabels: nextLabels,
              };
            }
            if (kind === 'flashcards') {
              return {
                ...lesson,
                lastUpdated: today,
                flashcards:
                  strategy === 'append'
                    ? [...lesson.flashcards, ...source.flashcards]
                    : source.flashcards,
                resourceLabels: nextLabels,
              };
            }
            if (kind === 'quiz') {
              return {
                ...lesson,
                lastUpdated: today,
                quiz:
                  strategy === 'append' ? [...lesson.quiz, ...source.quiz] : source.quiz,
                resourceLabels: nextLabels,
              };
            }
          }

          return lesson;
        });
      });

      if (kind === 'lecture') {
        setHighlights((prev) =>
          prev.map((h) => (h.lessonId === fromLessonId ? { ...h, lessonId: toLessonId } : h))
        );
        setPassageComments((prev) =>
          prev.map((c) => (c.lessonId === fromLessonId ? { ...c, lessonId: toLessonId } : c))
        );
      }
    },
    [customCardsByLesson]
  );

  const handleDeleteResource = useCallback((lessonId: string, kind: ResourceKind) => {
    const today = todayPersianDate();

    if (kind === 'flashcards') {
      setCustomCardsByLesson((prev) => {
        if (!prev[lessonId]) return prev;
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
    }

    if (kind === 'lecture') {
      setHighlights((prev) => prev.filter((h) => h.lessonId !== lessonId));
      setPassageComments((prev) => prev.filter((c) => c.lessonId !== lessonId));
    }

    setLessons((prev) =>
      prev.map((lesson) => {
        if (lesson.id !== lessonId) return lesson;
        const nextLabels = { ...(lesson.resourceLabels ?? {}) };
        delete nextLabels[kind];

        if (kind === 'lecture') {
          return {
            ...lesson,
            lastUpdated: today,
            sections: [],
            readingMinutes: 0,
            summary: '',
            resourceLabels: nextLabels,
          };
        }
        if (kind === 'mindmap') {
          return {
            ...lesson,
            lastUpdated: today,
            mindmap: createEmptyMindmapNode(lesson.id, lesson.title),
            resourceLabels: nextLabels,
          };
        }
        if (kind === 'flashcards') {
          return {
            ...lesson,
            lastUpdated: today,
            flashcards: [],
            resourceLabels: nextLabels,
          };
        }
        return {
          ...lesson,
          lastUpdated: today,
          quiz: [],
          resourceLabels: nextLabels,
        };
      })
    );
  }, []);

  const handleSearchNavigate = useCallback((target: SearchNavigationTarget) => {
    setActiveLessonId(target.lessonId);
    setWorkspaceMode(target.mode);
    setFocusSectionId(target.mode === 'notes' ? (target.sectionId ?? null) : null);
    setFocusMindmapNodeId(target.mode === 'mindmap' ? (target.mindmapNodeId ?? null) : null);
    setFocusFlashcardId(target.mode === 'flashcards' ? (target.flashcardId ?? null) : null);
    setFocusQuizQuestionId(target.mode === 'quiz' ? (target.quizQuestionId ?? null) : null);
    if (target.mode !== 'notes') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const activeLessonNotes = useMemo(
    () => (activeLesson ? userNotes.filter((n) => n.lessonId === activeLesson.id) : []),
    [userNotes, activeLesson]
  );

  const activeLessonHighlights = useMemo(
    () => (activeLesson ? highlights.filter((h) => h.lessonId === activeLesson.id) : []),
    [highlights, activeLesson]
  );

  const handleAddHighlight = useCallback(
    (payload: NewHighlightPayload): string | null => {
      if (!activeLesson || payload.anchors.length === 0) return null;
      const now = new Date().toLocaleDateString('fa-IR', {
        month: 'short',
        day: 'numeric',
      });
      const anchorSig = payload.anchors
        .map((a) => `${a.kind}:${a.value}`)
        .sort()
        .join('|');

      const existing = highlights.find((h) => {
        if (h.lessonId !== activeLesson.id) return false;
        if ((h.sectionId ?? '') !== (payload.sectionId ?? '')) return false;
        const existingSig = (h.anchors ?? [{ kind: 'text', value: h.text }])
          .map((a) => `${a.kind}:${a.value}`)
          .sort()
          .join('|');
        return existingSig === anchorSig;
      });

      const targetId =
        existing?.id ?? `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      setHighlights((prev) => {
        const next = [...prev];
        const existingIdx = next.findIndex((h) => {
          if (h.lessonId !== activeLesson.id) return false;
          if ((h.sectionId ?? '') !== (payload.sectionId ?? '')) return false;
          const existingSig = (h.anchors ?? [{ kind: 'text', value: h.text }])
            .map((a) => `${a.kind}:${a.value}`)
            .sort()
            .join('|');
          return existingSig === anchorSig;
        });

        if (existingIdx !== -1) {
          next[existingIdx] = {
            ...next[existingIdx],
            color: payload.color,
            text: payload.text,
            anchors: payload.anchors,
          };
          return next;
        }

        next.unshift({
          id: targetId,
          lessonId: activeLesson.id,
          sectionId: payload.sectionId,
          text: payload.text,
          anchors: payload.anchors,
          color: payload.color,
          createdAt: now,
        });
        return next;
      });

      return targetId;
    },
    [activeLesson, highlights]
  );

  const handleRemoveHighlight = useCallback((highlightId: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
  }, []);

  const handleRestoreHighlight = useCallback((highlight: TextHighlight) => {
    setHighlights((prev) => {
      if (prev.some((h) => h.id === highlight.id)) return prev;
      return [highlight, ...prev];
    });
  }, []);

  const handleUpdateHighlightColor = (highlightId: string, color: HighlightColor) => {
    setHighlights((prev) =>
      prev.map((h) => (h.id === highlightId ? { ...h, color } : h))
    );
  };

  const handleClearLessonHighlights = () => {
    if (!activeLesson) return;
    setHighlights((prev) => prev.filter((h) => h.lessonId !== activeLesson.id));
  };

  // Inline Passage Comments handlers
  const activeLessonComments = useMemo(
    () => (activeLesson ? passageComments.filter((c) => c.lessonId === activeLesson.id) : []),
    [passageComments, activeLesson]
  );

  const handleAddPassageComment = useCallback(
    (payload: { sectionId?: string; quote: string; comment: string }) => {
      if (!activeLesson) return;
      const newComment: PassageComment = {
        id: `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        lessonId: activeLesson.id,
        sectionId: payload.sectionId,
        quote: payload.quote,
        comment: payload.comment,
        createdAt: todayPersianDate(),
      };
      setPassageComments((prev) => [newComment, ...prev]);
    },
    [activeLesson]
  );

  const handleUpdatePassageComment = useCallback((commentId: string, comment: string) => {
    setPassageComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, comment, updatedAt: todayPersianDate() } : c
      )
    );
  }, []);

  const handleDeletePassageComment = useCallback((commentId: string) => {
    setPassageComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

  // Single-Item Content Edit & Delete Handlers (Sections, Flashcards, Mindmap, Quiz)
  const handleUpdateSection = useCallback(
    (lessonId: string, sectionId: string, updates: { title: string; markdownBody: string }) => {
      const today = todayPersianDate();
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          const nextSections = lesson.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  title: updates.title,
                  markdownBody: updates.markdownBody,
                  paragraphs: [],
                }
              : s
          );
          return {
            ...lesson,
            lastUpdated: today,
            sections: nextSections,
            readingMinutes: estimateReadingMinutesFromSections(nextSections),
          };
        })
      );
    },
    []
  );

  const handleAddSection = useCallback(
    (lessonId: string, input: { title: string; markdownBody: string }) => {
      const today = todayPersianDate();
      setLessons((prev) =>
        prev.map((lesson) => {
          if (lesson.id !== lessonId) return lesson;
          const nextIdx = lesson.sections.length + 1;
          const newSection = {
            id: `sec-${Date.now().toString(36)}-${nextIdx}`,
            number: `${lesson.chapterNumber}.${nextIdx}`,
            title: input.title,
            paragraphs: [],
            markdownBody: input.markdownBody,
          };
          const nextSections = [...lesson.sections, newSection];
          return {
            ...lesson,
            lastUpdated: today,
            sections: nextSections,
            readingMinutes: estimateReadingMinutesFromSections(nextSections),
          };
        })
      );
    },
    []
  );

  const handleDeleteSection = useCallback((lessonId: string, sectionId: string) => {
    const today = todayPersianDate();
    setLessons((prev) =>
      prev.map((lesson) => {
        if (lesson.id !== lessonId) return lesson;
        const nextSections = lesson.sections
          .filter((s) => s.id !== sectionId)
          .map((s, idx) => ({ ...s, number: `${lesson.chapterNumber}.${idx + 1}` }));
        return {
          ...lesson,
          lastUpdated: today,
          sections: nextSections,
          readingMinutes: estimateReadingMinutesFromSections(nextSections),
        };
      })
    );
    setBookmarkedSections((prev) => prev.filter((k) => k !== `${lessonId}:${sectionId}`));
  }, []);

  const handleUpdateFlashcard = useCallback(
    (cardId: string, updates: Partial<Flashcard>) => {
      if (!activeLesson) return;
      const lessonId = activeLesson.id;
      const inImported = activeLesson.flashcards.some((c) => c.id === cardId);
      if (inImported) {
        setLessons((prev) =>
          prev.map((l) =>
            l.id === lessonId
              ? {
                  ...l,
                  lastUpdated: todayPersianDate(),
                  flashcards: l.flashcards.map((c) =>
                    c.id === cardId ? { ...c, ...updates } : c
                  ),
                }
              : l
          )
        );
      } else {
        setCustomCardsByLesson((prev) => ({
          ...prev,
          [lessonId]: (prev[lessonId] ?? []).map((c) =>
            c.id === cardId ? { ...c, ...updates } : c
          ),
        }));
      }
    },
    [activeLesson]
  );

  const handleDeleteFlashcard = useCallback(
    (cardId: string) => {
      if (!activeLesson) return;
      const lessonId = activeLesson.id;
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? {
                ...l,
                lastUpdated: todayPersianDate(),
                flashcards: l.flashcards.filter((c) => c.id !== cardId),
              }
            : l
        )
      );
      setCustomCardsByLesson((prev) => {
        const list = prev[lessonId];
        if (!list) return prev;
        return {
          ...prev,
          [lessonId]: list.filter((c) => c.id !== cardId),
        };
      });
      setCardStatuses((prev) => {
        if (!(cardId in prev)) return prev;
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
    },
    [activeLesson]
  );

  const handleUpdateMindmap = useCallback(
    (nextRoot: MindmapNode) => {
      if (!activeLesson) return;
      const lessonId = activeLesson.id;
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? {
                ...l,
                lastUpdated: todayPersianDate(),
                mindmap: nextRoot,
              }
            : l
        )
      );
    },
    [activeLesson]
  );

  const handleUpdateQuizQuestion = useCallback((lessonId: string, question: QuizQuestion) => {
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              lastUpdated: todayPersianDate(),
              quiz: l.quiz.map((q) => (q.id === question.id ? question : q)),
            }
          : l
      )
    );
  }, []);

  const handleDeleteQuizQuestion = useCallback((lessonId: string, questionId: string) => {
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              lastUpdated: todayPersianDate(),
              quiz: l.quiz.filter((q) => q.id !== questionId),
            }
          : l
      )
    );
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1E293B] transition-colors dark:bg-[#0F1419] dark:text-[#E2E8F0]">
      <Header
        courses={courses}
        lessons={lessons}
        activeLesson={activeLesson}
        onSelectLesson={(id) => {
          setActiveLessonId(id);
          if (workspaceMode !== 'notes') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        workspaceMode={workspaceMode}
        onChangeMode={(mode) => {
          setWorkspaceMode(mode);
          if (mode !== 'notes') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        fontScale={fontScale}
        onAdjustFontScale={handleAdjustFontScale}
        themePreference={themePreference}
        isDark={isDark}
        systemPrefersDark={systemPrefersDark}
        onChangeThemePreference={setThemePreference}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenImportModal={() => setImportModalOpen(true)}
        onOpenMobileSyllabus={() => setMobileSyllabusOpen(true)}
        notesCount={activeLessonNotes.length}
        lessonMasteryMap={lessonMasteryMap}
        headerCollapsed={headerCollapsed}
        onToggleHeaderCollapsed={handleToggleHeaderCollapsed}
        isFullFocusMode={isFullFocusMode}
        onExitFocusMode={handleExitFocusMode}
        studyTimer={studyTimer}
        activeLessonStudySeconds={activeLesson ? studySecondsByLesson[activeLesson.id] ?? 0 : 0}
        liveReadingSnapshot={liveReadingSnapshot}
        activeLessonCheckpoint={activeLesson ? studyCheckpointsByLesson[activeLesson.id] ?? null : null}
        onSaveStudySession={handleSaveStudySession}
      />

      {workspaceMode !== 'resources' && !activeLesson && (
        <main className="mx-auto max-w-[920px] px-4 py-10 md:px-6 lg:py-16">
          <div className="elevation-tier-1 rounded-3xl border border-[#E2E8F0] bg-[#FAF9F6] px-6 py-12 text-center dark:border-[#27323E] dark:bg-[#161D24] sm:px-12 sm:py-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488] text-white shadow-sm">
              <BookOpen className="h-8 w-8" />
            </div>

            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] sm:text-3xl">
              به جادرسی خوش آمدید
            </h1>
            <p className="mx-auto mt-3 max-w-[540px] text-sm leading-7 text-[#475569] dark:text-[#94A3B8]">
              میز مطالعه شما کاملاً تمیز و آماده شروع است. اولین درس خود را ایجاد کنید و جزوه، مایندمپ، فلش‌کارت یا آزمون تستی آن را وارد نمایید.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0D9488] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <FileUp className="h-4 w-4 shrink-0" />
                <span>ایجاد درس جدید و ورود فایل‌ها</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode('resources')}
                className="inline-flex items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-5 py-3 text-sm font-semibold text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
              >
                <FolderCog className="h-4 w-4 shrink-0" />
                <span>باز کردن مدیریت منابع</span>
              </button>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-3 border-t border-[#E2E8F0] pt-8 text-right dark:border-[#27323E] sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
                <div className="flex items-center justify-between">
                  <BookOpen className="h-4.5 w-4.5 text-[#0D9488] dark:text-[#2DD4BF]" />
                  <span className="ltr-inline font-mono text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    .md
                  </span>
                </div>
                <h2 className="mt-2.5 text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                  جزوه درسی
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-[#64748B] dark:text-[#94A3B8]">
                  پشتیبانی از فارسی راست‌به‌چپ، فرمول‌های LaTeX و هایلایت متن
                </p>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
                <div className="flex items-center justify-between">
                  <Network className="h-4.5 w-4.5 text-[#0D9488] dark:text-[#2DD4BF]" />
                  <span className="ltr-inline font-mono text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    .json
                  </span>
                </div>
                <h2 className="mt-2.5 text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                  مایندمپ
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-[#64748B] dark:text-[#94A3B8]">
                  نمای درختی و گرافیکی مرکزی تعاملی برای مرور ساختار مفاهیم
                </p>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
                <div className="flex items-center justify-between">
                  <FlashcardIcon className="h-4.5 w-4.5 text-[#0D9488] dark:text-[#2DD4BF]" />
                  <span className="ltr-inline font-mono text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    .csv
                  </span>
                </div>
                <h2 className="mt-2.5 text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                  فلش‌کارت مرور
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-[#64748B] dark:text-[#94A3B8]">
                  مرور هوشمند با میانبرهای صفحه‌کلید و ثبت میزان تسلط
                </p>
              </div>

              <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
                <div className="flex items-center justify-between">
                  <CheckSquare className="h-4.5 w-4.5 text-[#0D9488] dark:text-[#2DD4BF]" />
                  <span className="ltr-inline font-mono text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
                    .json
                  </span>
                </div>
                <h2 className="mt-2.5 text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">
                  آزمون تستی دوحالته
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-[#64748B] dark:text-[#94A3B8]">
                  ارزیابی فصلی و ترکیبی در حالت بازخورد آنی یا آزمون زمان‌دار
                </p>
              </div>
            </div>
          </div>
        </main>
      )}

      {workspaceMode === 'notes' && activeLesson && (
        <ArticleWorkspace
          courses={courses}
          lessons={lessons}
          activeLesson={activeLesson}
          onSelectLesson={(id) => {
            setActiveLessonId(id);
          }}
          onChangeMode={(mode) => {
            setWorkspaceMode(mode);
            if (mode !== 'notes') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          fontScale={fontScale}
          bookmarkedSections={bookmarkedSections}
          onToggleBookmark={handleToggleBookmark}
          lessonNotes={activeLessonNotes}
          onQuickAddNote={() => setDrawerOpen(true)}
          focusSectionId={focusSectionId}
          onClearFocusSection={handleClearFocusSection}
          mobileSyllabusOpen={mobileSyllabusOpen}
          onCloseMobileSyllabus={() => setMobileSyllabusOpen(false)}
          lessonMasteryMap={lessonMasteryMap}
          rightSidebarOpen={rightSidebarOpen}
          leftSidebarOpen={leftSidebarOpen}
          headerCollapsed={headerCollapsed}
          isFocusMode={isFullFocusMode}
          studySeconds={studySecondsByLesson[activeLesson.id] ?? 0}
          savedCheckpoint={studyCheckpointsByLesson[activeLesson.id] ?? null}
          onReadingStateChange={setLiveReadingSnapshot}
          onToggleRightSidebar={() => setRightSidebarOpen((v) => !v)}
          onToggleLeftSidebar={() => setLeftSidebarOpen((v) => !v)}
          onToggleFocusMode={handleToggleFocusMode}
          lessonHighlights={activeLessonHighlights}
          onAddHighlight={handleAddHighlight}
          onRemoveHighlight={handleRemoveHighlight}
          onRestoreHighlight={handleRestoreHighlight}
          onUpdateHighlightColor={handleUpdateHighlightColor}
          onClearLessonHighlights={handleClearLessonHighlights}
          onOpenImportModal={() => setImportModalOpen(true)}
          onReorderCourses={handleReorderCourses}
          onReorderLessons={handleReorderLessons}
          onUpdateSection={handleUpdateSection}
          onAddSection={handleAddSection}
          onDeleteSection={handleDeleteSection}
          lessonComments={activeLessonComments}
          onAddPassageComment={handleAddPassageComment}
          onUpdatePassageComment={handleUpdatePassageComment}
          onDeletePassageComment={handleDeletePassageComment}
        />
      )}

      {workspaceMode === 'mindmap' && activeLesson && (
        <MindmapWorkspace
          lesson={activeLesson}
          onJumpToSection={handleJumpToSection}
          onUpdateMindmap={handleUpdateMindmap}
          focusNodeId={focusMindmapNodeId}
          onClearFocusNode={handleClearFocusMindmapNode}
          onOpenImportModal={() => setImportModalOpen(true)}
          onOpenResources={() => setWorkspaceMode('resources')}
        />
      )}

      {workspaceMode === 'flashcards' && activeLesson && (
        <FlashcardWorkspace
          lesson={activeLesson}
          cards={activeLessonCards}
          statusMap={cardStatuses}
          onUpdateStatus={handleUpdateCardStatus}
          onResetLessonStatuses={handleResetLessonCardStatuses}
          onAddCustomCard={handleAddCustomCard}
          onUpdateCard={handleUpdateFlashcard}
          onDeleteCard={handleDeleteFlashcard}
          onJumpToSection={handleJumpToSection}
          focusCardId={focusFlashcardId}
          onClearFocusCard={handleClearFocusFlashcard}
          onOpenImportModal={() => setImportModalOpen(true)}
          onOpenResources={() => setWorkspaceMode('resources')}
        />
      )}

      {workspaceMode === 'quiz' && activeLesson && (
        <QuizWorkspace
          lesson={activeLesson}
          lessons={lessons}
          onJumpToSection={handleJumpToSection}
          onJumpToLessonSection={handleJumpToLessonSection}
          onSaveQuizBestScore={handleSaveQuizBestScore}
          onUpdateQuizQuestion={handleUpdateQuizQuestion}
          onDeleteQuizQuestion={handleDeleteQuizQuestion}
          focusQuestionId={focusQuizQuestionId}
          onClearFocusQuestion={handleClearFocusQuizQuestion}
          onOpenImportModal={() => setImportModalOpen(true)}
          onOpenResources={() => setWorkspaceMode('resources')}
        />
      )}

      {workspaceMode === 'resources' && (
        <ResourceManagerWorkspace
          courses={courses}
          lessons={lessons}
          activeLessonId={activeLesson?.id ?? null}
          customCardsByLesson={customCardsByLesson}
          onSelectLesson={(id) => setActiveLessonId(id)}
          onOpenLessonInMode={(id, mode) => {
            setActiveLessonId(id);
            setWorkspaceMode(mode);
            if (mode !== 'notes') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          onOpenBatchImport={() => setImportModalOpen(true)}
          onCreateCourse={handleCreateCourse}
          onRenameCourse={handleRenameCourse}
          onDeleteCourse={handleDeleteCourse}
          onReorderCourses={handleReorderCourses}
          onCreateLesson={handleCreateLesson}
          onRenameLesson={handleRenameLesson}
          onDeleteLesson={handleDeleteLesson}
          onReorderLessons={handleReorderLessons}
          onReplaceResource={handleReplaceResource}
          onRenameResource={handleRenameResource}
          onRenameSection={handleRenameSection}
          onMoveResource={handleMoveResource}
          onDeleteResource={handleDeleteResource}
        />
      )}

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        lessons={lessons}
        customCardsByLesson={customCardsByLesson}
        onNavigate={handleSearchNavigate}
      />

      <NotesDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeLesson={activeLesson}
        lessons={lessons}
        notes={userNotes}
        bookmarkedSections={bookmarkedSections}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        onJumpToBookmark={(lessonId, sectionId) => {
          setActiveLessonId(lessonId);
          setWorkspaceMode('notes');
          setFocusSectionId(sectionId);
        }}
      />

      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        courses={courses}
        activeLesson={activeLesson}
        nextChapterNumber={lessons.length + 1}
        onApplyImport={handleApplyImport}
        onDeleteCustomLesson={handleDeleteLesson}
      />
    </div>
  );
}
