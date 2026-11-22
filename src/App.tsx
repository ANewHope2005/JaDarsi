/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CURRICULUM } from './data/curriculum';
import {
  Flashcard,
  FlashcardStatus,
  HighlightColor,
  Lesson,
  MindmapNode,
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
  CreateLessonInput,
  RenameLessonInput,
  ReplaceResourcePayload,
  ResourceManagerWorkspace,
} from './components/ResourceManagerWorkspace';
import { SearchModal } from './components/SearchModal';
import { NotesDrawer } from './components/NotesDrawer';
import { ImportModal, LessonImportPayload } from './components/ImportModal';

const STORAGE_KEYS = {
  themeMode: 'archival_scholar_theme_mode',
  fontScale: 'archival_scholar_font_scale',
  cardStatuses: 'archival_scholar_fc_statuses',
  customCards: 'archival_scholar_custom_cards',
  bookmarks: 'archival_scholar_bookmarks',
  notes: 'archival_scholar_notes',
  quizScores: 'archival_scholar_quiz_scores',
  lessons: 'archival_scholar_lessons_v1',
  rightSidebar: 'archival_scholar_right_sidebar',
  leftSidebar: 'archival_scholar_left_sidebar',
  highlights: 'archival_scholar_highlights_v1',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readThemePreference(): ThemePreference {
  const stored = readStorage<string | null>(STORAGE_KEYS.themeMode, null);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
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
    subtitle: 'بدون درخت دانش',
    summary:
      'هنوز فایل درخت دانش (.json) برای این درس ثبت نشده است. از بخش «مدیریت منابع» فایل مایندمپ را بارگذاری کنید.',
  };
}

function todayPersianDate(): string {
  return new Date().toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const DEFAULT_NOTES: UserNote[] = [
  {
    id: 'welcome-note-1',
    lessonId: 'thermodynamics-entropy',
    sectionId: 'carnot-gibbs',
    title: 'یادآور تبدیل واحد دما در چرخه کارنو',
    content:
      'در محاسبه بازده کارنو (1 - T_C/T_H) همیشه دماها را پیش از جایگذاری با افزودن ۲۷۳.۱۵ به کلوین تبدیل کن تا خطای رایج سلسیوس رخ ندهد.',
    createdAt: 'ثبت اولیه در جادرسی',
  },
];

export default function App() {
  const [lessons, setLessons] = useState<Lesson[]>(() => {
    const saved = readStorage<Lesson[] | null>(STORAGE_KEYS.lessons, null);
    if (Array.isArray(saved) && saved.length > 0) return saved;
    return CURRICULUM;
  });

  const [activeLessonId, setActiveLessonId] = useState<string>(() => lessons[0]?.id ?? CURRICULUM[0].id);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('notes');
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readThemePreference());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPrefersDark());
  const [fontScale, setFontScale] = useState<number>(() => readStorage(STORAGE_KEYS.fontScale, 0));

  const isDark = themePreference === 'dark' || (themePreference === 'system' && systemPrefersDark);

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
    readStorage(STORAGE_KEYS.bookmarks, ['thermodynamics-entropy:boltzmann-entropy'])
  );
  const [userNotes, setUserNotes] = useState<UserNote[]>(() =>
    readStorage(STORAGE_KEYS.notes, DEFAULT_NOTES)
  );
  const [quizBestScores, setQuizBestScores] = useState<Record<string, number>>(() =>
    readStorage(STORAGE_KEYS.quizScores, {})
  );
  const [highlights, setHighlights] = useState<TextHighlight[]>(() =>
    readStorage(STORAGE_KEYS.highlights, [])
  );

  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [mobileSyllabusOpen, setMobileSyllabusOpen] = useState(false);
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);

  const activeLesson = useMemo(
    () => lessons.find((l) => l.id === activeLessonId) ?? lessons[0] ?? CURRICULUM[0],
    [lessons, activeLessonId]
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

  // Sync Tailwind dark class, colorScheme, and persist manual/system preference
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem(STORAGE_KEYS.themeMode, JSON.stringify(themePreference));
    } catch {
      // ignore storage quota errors
    }
  }, [isDark, themePreference]);

  // Persist user preferences, sidebar states, lessons, and study progress
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
      window.localStorage.setItem(STORAGE_KEYS.lessons, JSON.stringify(lessons));
      window.localStorage.setItem(STORAGE_KEYS.highlights, JSON.stringify(highlights));
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
    lessons,
    highlights,
  ]);

  // Global keyboard shortcut: Ctrl/Cmd + K for Search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeLessonCards = useMemo(() => {
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

  const handleToggleFocusMode = () => {
    if (!rightSidebarOpen && !leftSidebarOpen) {
      setRightSidebarOpen(true);
      setLeftSidebarOpen(true);
    } else {
      setRightSidebarOpen(false);
      setLeftSidebarOpen(false);
    }
  };

  const handleToggleBookmark = (sectionKey: string) => {
    setBookmarkedSections((prev) =>
      prev.includes(sectionKey) ? prev.filter((k) => k !== sectionKey) : [...prev, sectionKey]
    );
  };

  const handleJumpToSection = useCallback((sectionId: string) => {
    setWorkspaceMode('notes');
    setFocusSectionId(sectionId);
  }, []);

  const handleClearFocusSection = useCallback(() => {
    setFocusSectionId(null);
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

  const handleCreateFlashcardFromNode = (node: MindmapNode) => {
    handleAddCustomCard({
      front: `مفهوم «${node.title}» را توضیح دهید.`,
      frontFormula: node.formula,
      back: node.summary,
      category: 'ساخته‌شده از مایندمپ',
      sectionId: node.sectionId,
    });
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
    const todayFa = new Date().toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    if (payload.mode === 'update') {
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

    // Create a brand new lesson/chapter
    const newId = `lesson-custom-${Date.now().toString(36)}`;
    const chapterNumber = lessons.length + 1;

    const fallbackSection = {
      id: `sec-${newId}-1`,
      number: `${chapterNumber}.1`,
      title: 'مقدمه فصل',
      paragraphs: [
        'هنوز فایل جزوه Markdown (.md) برای این درس بارگذاری نشده است. می‌توانید از دکمه «ورود فایل‌ها / مدیریت درس» در نوار بالا، جزوه کامل را اضافه کنید.',
      ],
    };

    const fallbackMindmap: MindmapNode = {
      id: `mm-${newId}-root`,
      title: payload.title,
      subtitle: payload.code,
      summary:
        payload.markdown?.summary ??
        payload.quiz?.description ??
        'برای مشاهده درخت دانش کامل، فایل JSON مایندمپ را در این درس بارگذاری کنید.',
      children: (payload.markdown?.sections ?? []).map((sec, idx) => ({
        id: `mm-${newId}-s-${idx}`,
        title: sec.title,
        subtitle: sec.number,
        summary: `بخش ${sec.number} از جزوه ${payload.title}`,
        sectionId: sec.id,
      })),
    };

    const newLesson: Lesson = {
      id: newId,
      chapterNumber,
      code: payload.code,
      course: payload.course,
      title: payload.title,
      subtitle:
        payload.markdown?.subtitle ??
        payload.mindmap?.subtitle ??
        payload.quiz?.description ??
        'محتوای مطالعاتی واردشده توسط کاربر',
      readingMinutes: payload.markdown?.readingMinutes ?? 5,
      lastUpdated: todayFa,
      author: 'کتابخانه شخصی جادرسی',
      summary:
        payload.markdown?.summary ??
        payload.quiz?.description ??
        `فصل ${chapterNumber} شامل منابع واردشده برای مبحث ${payload.title}.`,
      sections: payload.markdown?.sections ?? [fallbackSection],
      mindmap: payload.mindmap?.root ?? fallbackMindmap,
      flashcards: payload.flashcards ?? [],
      quiz: payload.quiz?.questions ?? [],
      isCustom: true,
    };

    setLessons((prev) => [...prev, newLesson]);
    setActiveLessonId(newLesson.id);

    // Jump directly to the most relevant tab that received content
    if (payload.markdown) setWorkspaceMode('notes');
    else if (payload.mindmap) setWorkspaceMode('mindmap');
    else if (payload.flashcards) setWorkspaceMode('flashcards');
    else if (payload.quiz) setWorkspaceMode('quiz');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteLesson = useCallback(
    (lessonId: string) => {
      setLessons((prev) => {
        if (prev.length <= 1) return prev;
        const remaining = prev
          .filter((l) => l.id !== lessonId)
          .map((l, idx) => ({ ...l, chapterNumber: idx + 1 }));
        if (activeLessonId === lessonId && remaining[0]) {
          setActiveLessonId(remaining[0].id);
        }
        return remaining;
      });
      setCustomCardsByLesson((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
      setUserNotes((prev) => prev.filter((n) => n.lessonId !== lessonId));
      setHighlights((prev) => prev.filter((h) => h.lessonId !== lessonId));
      setBookmarkedSections((prev) => prev.filter((k) => !k.startsWith(`${lessonId}:`)));
      setQuizBestScores((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
    },
    [activeLessonId]
  );

  const handleCreateLesson = useCallback(
    (input: CreateLessonInput): string => {
      const newId = `lesson-custom-${Date.now().toString(36)}`;
      const chapterNumber = lessons.length + 1;
      const newLesson: Lesson = {
        id: newId,
        chapterNumber,
        code: input.code,
        course: input.course,
        title: input.title,
        subtitle: 'درس ایجادشده در مدیریت منابع جادرسی',
        readingMinutes: 0,
        lastUpdated: todayPersianDate(),
        author: 'کتابخانه شخصی جادرسی',
        summary: '',
        sections: [],
        mindmap: createEmptyMindmapNode(newId, input.title),
        flashcards: [],
        quiz: [],
        isCustom: true,
      };
      setLessons((prev) => [...prev, newLesson]);
      return newId;
    },
    [lessons.length]
  );

  const handleRenameLesson = useCallback((lessonId: string, input: RenameLessonInput) => {
    const today = todayPersianDate();
    setLessons((prev) =>
      prev.map((l) =>
        l.id === lessonId
          ? {
              ...l,
              title: input.title,
              course: input.course,
              code: input.code,
              lastUpdated: today,
            }
          : l
      )
    );
  }, []);

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

  const handleSearchNavigate = (lessonId: string, mode: WorkspaceMode, sectionId?: string) => {
    setActiveLessonId(lessonId);
    setWorkspaceMode(mode);
    if (mode === 'notes' && sectionId) {
      setFocusSectionId(sectionId);
    }
  };

  const activeLessonNotes = useMemo(
    () => userNotes.filter((n) => n.lessonId === activeLesson.id),
    [userNotes, activeLesson.id]
  );

  const activeLessonHighlights = useMemo(
    () => highlights.filter((h) => h.lessonId === activeLesson.id),
    [highlights, activeLesson.id]
  );

  const handleAddHighlight = useCallback(
    (payload: NewHighlightPayload) => {
      if (payload.anchors.length === 0) return;
      const now = new Date().toLocaleDateString('fa-IR', {
        month: 'short',
        day: 'numeric',
      });
      const anchorSig = payload.anchors
        .map((a) => `${a.kind}:${a.value}`)
        .sort()
        .join('|');

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
          id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          lessonId: activeLesson.id,
          sectionId: payload.sectionId,
          text: payload.text,
          anchors: payload.anchors,
          color: payload.color,
          createdAt: now,
        });
        return next;
      });
    },
    [activeLesson.id]
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
    setHighlights((prev) => prev.filter((h) => h.lessonId !== activeLesson.id));
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1E293B] transition-colors dark:bg-[#0F1419] dark:text-[#E2E8F0]">
      <Header
        lessons={lessons}
        activeLesson={activeLesson}
        onSelectLesson={(id) => {
          setActiveLessonId(id);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        workspaceMode={workspaceMode}
        onChangeMode={(mode) => {
          setWorkspaceMode(mode);
          window.scrollTo({ top: 0, behavior: 'smooth' });
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
      />

      {workspaceMode === 'notes' && (
        <ArticleWorkspace
          lessons={lessons}
          activeLesson={activeLesson}
          onSelectLesson={(id) => {
            setActiveLessonId(id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onChangeMode={(mode) => {
            setWorkspaceMode(mode);
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
          onToggleRightSidebar={() => setRightSidebarOpen((v) => !v)}
          onToggleLeftSidebar={() => setLeftSidebarOpen((v) => !v)}
          onToggleFocusMode={handleToggleFocusMode}
          lessonHighlights={activeLessonHighlights}
          onAddHighlight={handleAddHighlight}
          onRemoveHighlight={handleRemoveHighlight}
          onRestoreHighlight={handleRestoreHighlight}
          onUpdateHighlightColor={handleUpdateHighlightColor}
          onClearLessonHighlights={handleClearLessonHighlights}
        />
      )}

      {workspaceMode === 'mindmap' && (
        <MindmapWorkspace
          lesson={activeLesson}
          onJumpToSection={handleJumpToSection}
          onCreateFlashcardFromNode={handleCreateFlashcardFromNode}
          onOpenResources={() => setWorkspaceMode('resources')}
        />
      )}

      {workspaceMode === 'flashcards' && (
        <FlashcardWorkspace
          lesson={activeLesson}
          cards={activeLessonCards}
          statusMap={cardStatuses}
          onUpdateStatus={handleUpdateCardStatus}
          onResetLessonStatuses={handleResetLessonCardStatuses}
          onAddCustomCard={handleAddCustomCard}
          onJumpToSection={handleJumpToSection}
        />
      )}

      {workspaceMode === 'quiz' && (
        <QuizWorkspace
          lesson={activeLesson}
          onJumpToSection={handleJumpToSection}
          onSaveQuizBestScore={handleSaveQuizBestScore}
          onOpenImportModal={() => setImportModalOpen(true)}
        />
      )}

      {workspaceMode === 'resources' && (
        <ResourceManagerWorkspace
          lessons={lessons}
          activeLessonId={activeLesson.id}
          customCardsByLesson={customCardsByLesson}
          onSelectLesson={(id) => setActiveLessonId(id)}
          onOpenLessonInMode={(id, mode) => {
            setActiveLessonId(id);
            setWorkspaceMode(mode);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenBatchImport={() => setImportModalOpen(true)}
          onCreateLesson={handleCreateLesson}
          onRenameLesson={handleRenameLesson}
          onDeleteLesson={handleDeleteLesson}
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
        activeLesson={activeLesson}
        nextChapterNumber={lessons.length + 1}
        onApplyImport={handleApplyImport}
        onDeleteCustomLesson={handleDeleteLesson}
      />
    </div>
  );
}
