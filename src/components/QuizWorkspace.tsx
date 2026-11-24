import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  RotateCcw,
  XCircle,
  Award,
  FileUp,
  Shuffle,
  SlidersHorizontal,
  Play,
  Layers3,
  Minus,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { Lesson, QuizOption, QuizQuestion } from '../types/study';
import { FormulaDisplay, RichMathText } from '../utils/latexText';
import { HoverTooltip } from './ui/HoverTooltip';

interface QuizWorkspaceProps {
  lesson: Lesson;
  lessons: Lesson[];
  onJumpToSection: (sectionId: string) => void;
  onJumpToLessonSection: (lessonId: string, sectionId: string) => void;
  onSaveQuizBestScore: (lessonId: string, scorePercent: number) => void;
  onUpdateQuizQuestion?: (lessonId: string, question: QuizQuestion) => void;
  onDeleteQuizQuestion?: (lessonId: string, questionId: string) => void;
  focusQuestionId?: string | null;
  onClearFocusQuestion?: () => void;
  onOpenImportModal?: () => void;
  onOpenResources?: () => void;
}

type QuizMode = 'instant' | 'exam';
type QuizScope = 'single' | 'combined';
type CombinedAllocationMode = 'per-lesson' | 'total';

interface SessionQuestion extends QuizQuestion {
  sessionKey: string;
  sourceLessonId: string;
  sourceLessonTitle: string;
  sourceChapterNumber: number;
}

function arraysMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function tagQuestions(source: Lesson, list: QuizQuestion[]): SessionQuestion[] {
  return list.map((q, idx) => ({
    ...q,
    sessionKey: `${source.id}::${q.id}::${idx}`,
    sourceLessonId: source.id,
    sourceLessonTitle: source.title,
    sourceChapterNumber: source.chapterNumber,
  }));
}

export const QuizWorkspace: React.FC<QuizWorkspaceProps> = ({
  lesson,
  lessons,
  onJumpToSection,
  onJumpToLessonSection,
  onSaveQuizBestScore,
  onUpdateQuizQuestion,
  onDeleteQuizQuestion,
  focusQuestionId,
  onClearFocusQuestion,
  onOpenImportModal,
  onOpenResources,
}) => {
  const lessonsWithQuiz = useMemo(() => lessons.filter((l) => l.quiz.length > 0), [lessons]);

  const [phase, setPhase] = useState<'setup' | 'active'>('setup');
  const [quizScope, setQuizScope] = useState<QuizScope>('single');
  const [mode, setMode] = useState<QuizMode>('instant');
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(false);

  // Single-lesson count settings
  const [singleCountMode, setSingleCountMode] = useState<'all' | 'custom'>('all');
  const [singleCustomCount, setSingleCustomCount] = useState<number>(() =>
    Math.min(10, Math.max(1, lesson.quiz.length))
  );

  // Combined multi-lesson quiz settings
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>(() =>
    lessonsWithQuiz.map((l) => l.id)
  );
  const [combinedAllocationMode, setCombinedAllocationMode] =
    useState<CombinedAllocationMode>('per-lesson');
  const [perLessonCounts, setPerLessonCounts] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const l of lessonsWithQuiz) {
      map[l.id] = Math.min(5, l.quiz.length);
    }
    return map;
  });
  const [combinedTotalMode, setCombinedTotalMode] = useState<'all' | 'custom'>('custom');
  const [combinedTotalCount, setCombinedTotalCount] = useState<number>(10);

  // Active quiz session state
  const [sessionQuestions, setSessionQuestions] = useState<SessionQuestion[]>([]);
  const [activeScopeLabel, setActiveScopeLabel] = useState<string>('');
  const [isCombinedSession, setIsCombinedSession] = useState<boolean>(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [revealedInstant, setRevealedInstant] = useState<Record<string, boolean>>({});
  const [openExplanation, setOpenExplanation] = useState<Record<string, boolean>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Single-question Edit & Delete state
  const [editingQuestion, setEditingQuestion] = useState<{
    sessionKey: string;
    sourceLessonId: string;
    id: string;
    type: 'single' | 'multi';
    prompt: string;
    promptFormula: string;
    options: QuizOption[];
    correctOptionIds: string[];
    explanation: string;
    sectionId?: string;
  } | null>(null);
  const [confirmDeleteQuestionKey, setConfirmDeleteQuestionKey] = useState<string | null>(null);

  // Keep per-lesson selections & defaults synced when lessons change
  useEffect(() => {
    setSelectedLessonIds((prev) => {
      const validIds = new Set(lessonsWithQuiz.map((l) => l.id));
      const kept = prev.filter((id) => validIds.has(id));
      if (kept.length > 0) return kept;
      return lessonsWithQuiz.map((l) => l.id);
    });
    setPerLessonCounts((prev) => {
      const next = { ...prev };
      for (const l of lessonsWithQuiz) {
        if (next[l.id] === undefined) {
          next[l.id] = Math.min(5, l.quiz.length);
        } else {
          next[l.id] = Math.max(1, Math.min(l.quiz.length, next[l.id]));
        }
      }
      return next;
    });
  }, [lessonsWithQuiz]);

  // Reset setup cleanly when switching active lesson (unless jumping directly to a search result)
  useEffect(() => {
    if (focusQuestionId) return;
    setPhase('setup');
    setSingleCountMode('all');
    setSingleCustomCount(Math.min(10, Math.max(1, lesson.quiz.length)));
    if (lesson.quiz.length === 0 && lessonsWithQuiz.length > 0) {
      setQuizScope('combined');
    } else {
      setQuizScope('single');
    }
    setCurrentIdx(0);
    setAnswers({});
    setRevealedInstant({});
    setOpenExplanation({});
    setFlaggedIds(new Set());
    setExamSubmitted(false);
    setElapsedSec(0);
  }, [lesson.id, lesson.quiz.length, lessonsWithQuiz.length, focusQuestionId]);

  // Direct jump to a specific quiz question from Global Search
  useEffect(() => {
    if (!focusQuestionId) return;
    const idx = lesson.quiz.findIndex((q) => q.id === focusQuestionId);
    if (idx !== -1) {
      const tagged = tagQuestions(lesson, lesson.quiz);
      setSessionQuestions(tagged);
      setActiveScopeLabel(`فصل ${lesson.chapterNumber}: ${lesson.title}`);
      setIsCombinedSession(false);
      setPhase('active');
      setCurrentIdx(idx);
      setAnswers({});
      setRevealedInstant({});
      setOpenExplanation({});
      setFlaggedIds(new Set());
      setExamSubmitted(false);
      setElapsedSec(0);
    }
    onClearFocusQuestion?.();
  }, [focusQuestionId, lesson, onClearFocusQuestion]);

  // Exam timer
  useEffect(() => {
    if (phase !== 'active' || mode !== 'exam' || examSubmitted) return;
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, mode, examSubmitted]);

  const selectedCombinedLessons = useMemo(
    () => lessonsWithQuiz.filter((l) => selectedLessonIds.includes(l.id)),
    [lessonsWithQuiz, selectedLessonIds]
  );

  const combinedMaxAvailable = useMemo(
    () => selectedCombinedLessons.reduce((acc, l) => acc + l.quiz.length, 0),
    [selectedCombinedLessons]
  );

  const plannedQuestionCount = useMemo(() => {
    if (quizScope === 'single') {
      if (lesson.quiz.length === 0) return 0;
      if (singleCountMode === 'all') return lesson.quiz.length;
      return Math.max(1, Math.min(lesson.quiz.length, singleCustomCount || 1));
    }
    if (selectedCombinedLessons.length === 0) return 0;
    if (combinedAllocationMode === 'per-lesson') {
      return selectedCombinedLessons.reduce(
        (acc, l) => acc + Math.max(1, Math.min(l.quiz.length, perLessonCounts[l.id] ?? l.quiz.length)),
        0
      );
    }
    if (combinedTotalMode === 'all') return combinedMaxAvailable;
    return Math.max(1, Math.min(combinedMaxAvailable, combinedTotalCount || 1));
  }, [
    quizScope,
    lesson.quiz.length,
    singleCountMode,
    singleCustomCount,
    selectedCombinedLessons,
    combinedAllocationMode,
    perLessonCounts,
    combinedTotalMode,
    combinedMaxAvailable,
    combinedTotalCount,
  ]);

  const buildSessionPool = (): { pool: SessionQuestion[]; label: string; combined: boolean } => {
    if (quizScope === 'single') {
      const tagged = tagQuestions(lesson, lesson.quiz);
      const count =
        singleCountMode === 'all'
          ? tagged.length
          : Math.max(1, Math.min(tagged.length, singleCustomCount || 1));
      const base = shuffleEnabled ? shuffleArray(tagged) : tagged;
      return {
        pool: base.slice(0, count),
        label: `فصل ${lesson.chapterNumber}: ${lesson.title}`,
        combined: false,
      };
    }

    // Combined Multi-Lesson Quiz
    const pool: SessionQuestion[] = [];
    if (combinedAllocationMode === 'per-lesson') {
      for (const l of selectedCombinedLessons) {
        const tagged = tagQuestions(l, l.quiz);
        const take = Math.max(1, Math.min(tagged.length, perLessonCounts[l.id] ?? tagged.length));
        const picked = (shuffleEnabled ? shuffleArray(tagged) : tagged).slice(0, take);
        pool.push(...picked);
      }
    } else {
      // Fair proportional distribution across selected lessons up to total requested count
      const targetTotal =
        combinedTotalMode === 'all'
          ? combinedMaxAvailable
          : Math.max(1, Math.min(combinedMaxAvailable, combinedTotalCount || 1));

      const buckets = selectedCombinedLessons.map((l) => ({
        items: shuffleEnabled ? shuffleArray(tagQuestions(l, l.quiz)) : tagQuestions(l, l.quiz),
        cursor: 0,
      }));

      while (pool.length < targetTotal) {
        let progressed = false;
        for (const bucket of buckets) {
          if (pool.length >= targetTotal) break;
          if (bucket.cursor < bucket.items.length) {
            pool.push(bucket.items[bucket.cursor]);
            bucket.cursor++;
            progressed = true;
          }
        }
        if (!progressed) break;
      }
    }

    const finalPool = shuffleEnabled ? shuffleArray(pool) : pool;
    return {
      pool: finalPool,
      label: `آزمون ترکیبی · ${selectedCombinedLessons.length} درس`,
      combined: true,
    };
  };

  const startConfiguredQuiz = () => {
    const { pool, label, combined } = buildSessionPool();
    if (pool.length === 0) return;
    setSessionQuestions(pool);
    setActiveScopeLabel(label);
    setIsCombinedSession(combined);
    setCurrentIdx(0);
    setAnswers({});
    setRevealedInstant({});
    setOpenExplanation({});
    setFlaggedIds(new Set());
    setExamSubmitted(false);
    setElapsedSec(0);
    setPhase('active');
  };

  const resetActiveSession = (reshuffle = false) => {
    setSessionQuestions((prev) => (reshuffle ? shuffleArray(prev) : prev));
    setCurrentIdx(0);
    setAnswers({});
    setRevealedInstant({});
    setOpenExplanation({});
    setFlaggedIds(new Set());
    setExamSubmitted(false);
    setElapsedSec(0);
  };

  const switchActiveMode = (nextMode: QuizMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (phase === 'active') {
      resetActiveSession(false);
    }
  };

  const toggleCombinedLesson = (id: string) => {
    setSelectedLessonIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const adjustLessonCount = (id: string, max: number, delta: number) => {
    setPerLessonCounts((prev) => {
      const current = prev[id] ?? Math.min(5, max);
      const next = Math.max(1, Math.min(max, current + delta));
      return { ...prev, [id]: next };
    });
  };

  const activeQuestion: SessionQuestion | undefined = sessionQuestions[currentIdx];

  const handleSelectOption = (q: SessionQuestion, optionId: string) => {
    if (mode === 'exam' && examSubmitted) return;
    if (mode === 'instant' && revealedInstant[q.sessionKey]) return;

    if (q.type === 'single') {
      setAnswers((prev) => ({ ...prev, [q.sessionKey]: [optionId] }));
      if (mode === 'instant') {
        setRevealedInstant((prev) => ({ ...prev, [q.sessionKey]: true }));
        setOpenExplanation((prev) => ({ ...prev, [q.sessionKey]: true }));
      }
    } else {
      setAnswers((prev) => {
        const current = prev[q.sessionKey] ?? [];
        const exists = current.includes(optionId);
        const updated = exists ? current.filter((id) => id !== optionId) : [...current, optionId];
        return { ...prev, [q.sessionKey]: updated };
      });
    }
  };

  const handleConfirmMultiInstant = (q: SessionQuestion) => {
    if ((answers[q.sessionKey]?.length ?? 0) === 0) return;
    setRevealedInstant((prev) => ({ ...prev, [q.sessionKey]: true }));
    setOpenExplanation((prev) => ({ ...prev, [q.sessionKey]: true }));
  };

  const toggleFlag = (sessionKey: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionKey)) next.delete(sessionKey);
      else next.add(sessionKey);
      return next;
    });
  };

  const scoreSummary = useMemo(() => {
    let correct = 0;
    let answered = 0;
    for (const q of sessionQuestions) {
      const selected = answers[q.sessionKey] ?? [];
      if (selected.length > 0) answered++;
      if (arraysMatch(selected, q.correctOptionIds)) correct++;
    }
    const percent =
      sessionQuestions.length > 0 ? Math.round((correct / sessionQuestions.length) * 100) : 0;
    return { correct, answered, total: sessionQuestions.length, percent };
  }, [sessionQuestions, answers]);

  const handleSubmitExam = () => {
    setExamSubmitted(true);
    const expanded: Record<string, boolean> = {};
    sessionQuestions.forEach((q) => {
      expanded[q.sessionKey] = true;
    });
    setOpenExplanation(expanded);
    if (!isCombinedSession) {
      onSaveQuizBestScore(lesson.id, scoreSummary.percent);
    }
  };

  // Save best score when all instant questions are answered (single-lesson session)
  useEffect(() => {
    if (
      phase === 'active' &&
      !isCombinedSession &&
      mode === 'instant' &&
      Object.keys(revealedInstant).length === sessionQuestions.length &&
      sessionQuestions.length > 0
    ) {
      onSaveQuizBestScore(lesson.id, scoreSummary.percent);
    }
  }, [
    phase,
    isCombinedSession,
    mode,
    revealedInstant,
    sessionQuestions.length,
    lesson.id,
    scoreSummary.percent,
    onSaveQuizBestScore,
  ]);

  const openEditQuestion = (q: SessionQuestion) => {
    setConfirmDeleteQuestionKey(null);
    setEditingQuestion({
      sessionKey: q.sessionKey,
      sourceLessonId: q.sourceLessonId,
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      promptFormula: q.promptFormula ?? '',
      options: q.options.map((o) => ({ ...o })),
      correctOptionIds: [...q.correctOptionIds],
      explanation: q.explanation,
      sectionId: q.sectionId,
    });
  };

  const handleSaveEditedQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !onUpdateQuizQuestion) return;
    const validOptions = editingQuestion.options
      .map((o) => ({ ...o, text: o.text.trim() }))
      .filter((o) => o.text.length > 0);
    if (!editingQuestion.prompt.trim() || validOptions.length < 2) return;

    const validCorrectIds = editingQuestion.correctOptionIds.filter((id) =>
      validOptions.some((o) => o.id === id)
    );
    const finalCorrectIds =
      validCorrectIds.length > 0 ? validCorrectIds : [validOptions[0].id];

    const updatedQuestion: QuizQuestion = {
      id: editingQuestion.id,
      type: editingQuestion.type,
      prompt: editingQuestion.prompt.trim(),
      promptFormula: editingQuestion.promptFormula.trim() || undefined,
      options: validOptions,
      correctOptionIds: editingQuestion.type === 'single' ? [finalCorrectIds[0]] : finalCorrectIds,
      explanation: editingQuestion.explanation.trim(),
      sectionId: editingQuestion.sectionId,
    };

    onUpdateQuizQuestion(editingQuestion.sourceLessonId, updatedQuestion);
    setSessionQuestions((prev) =>
      prev.map((sq) =>
        sq.sessionKey === editingQuestion.sessionKey ? { ...sq, ...updatedQuestion } : sq
      )
    );
    setEditingQuestion(null);
  };

  const handleConfirmDeleteQuestion = (q: SessionQuestion) => {
    if (!onDeleteQuizQuestion) return;
    onDeleteQuizQuestion(q.sourceLessonId, q.id);
    setSessionQuestions((prev) => {
      const remaining = prev.filter((item) => item.sessionKey !== q.sessionKey);
      if (remaining.length === 0) {
        setPhase('setup');
        setCurrentIdx(0);
      } else {
        setCurrentIdx((idx) => Math.min(idx, remaining.length - 1));
      }
      return remaining;
    });
    setConfirmDeleteQuestionKey(null);
  };

  // Helper to render clean, high-contrast printable exam sheet (zero dates, URLs, or taglines)
  const renderPrintableQuizSheet = (printTitle: string, list: QuizQuestion[]) => (
    <div className="print-surface hidden px-2 py-2 print:block">
      <header className="mb-6 border-b-2 border-black pb-3">
        <h1 className="text-xl font-bold text-black">{printTitle}</h1>
      </header>
      <ol className="space-y-5">
        {list.map((q, idx) => (
          <li key={`${q.id}-${idx}`} className="break-inside-avoid border-b border-black/20 pb-4">
            <div className="text-sm font-bold leading-7 text-black">
              <span className="ml-1.5 font-mono">{idx + 1}.</span>
              <RichMathText text={q.prompt} />
            </div>
            {q.promptFormula && (
              <div className="my-2 rounded border border-black/30 px-3 py-2 text-sm text-black">
                <FormulaDisplay formula={q.promptFormula} />
              </div>
            )}
            <ul className="mt-2.5 grid grid-cols-1 gap-1.5 pr-4 text-xs leading-6 text-black">
              {q.options.map((opt, optIdx) => {
                const persianLetters = ['الف', 'ب', 'ج', 'د', 'هـ', 'و'];
                const label = persianLetters[optIdx] ?? String(optIdx + 1);
                return (
                  <li key={opt.id} className="flex items-start gap-2">
                    <span className="font-semibold">({label})</span>
                    <span>
                      <RichMathText text={opt.text} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      {list.length > 0 && (
        <section className="mt-8 break-before-page border-t-2 border-black pt-4">
          <h2 className="mb-3 text-base font-bold text-black">کلید پاسخنامه</h2>
          <div className="grid grid-cols-2 gap-2 text-xs text-black sm:grid-cols-3">
            {list.map((q, idx) => {
              const persianLetters = ['الف', 'ب', 'ج', 'د', 'هـ', 'و'];
              const correctLabels = q.options
                .map((opt, i) => (q.correctOptionIds.includes(opt.id) ? persianLetters[i] ?? String(i + 1) : null))
                .filter(Boolean)
                .join('، ');
              return (
                <div key={`key-${q.id}-${idx}`} className="flex items-center gap-1.5">
                  <span className="font-mono font-bold">{idx + 1}.</span>
                  <span>{correctLabels || '—'}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );

  // Completely empty across ALL lessons
  if (lessonsWithQuiz.length === 0) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-12 text-center">
        <div className="elevation-tier-1 rounded-2xl bg-[#FAF9F6] px-6 py-14 dark:bg-[#161D24]">
          <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            هنوز سوال تستی برای این فصل ثبت نشده است
          </h2>
          <p className="mt-2 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
            می‌توانید یک فایل آزمون JSON شامل سوالات تک‌گزینه‌ای و چندگزینه‌ای را مستقیماً به این فصل اضافه کنید.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <FileUp className="h-4 w-4" />
                <span>ورود فایل آزمون (.json)</span>
              </button>
            )}
            {onOpenResources && (
              <button
                type="button"
                onClick={onOpenResources}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF]"
              >
                <span>مدیریت منابع</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ===================== PHASE 1: QUIZ SETUP / CONFIGURATOR ===================== */
  if (phase === 'setup' || !activeQuestion) {
    const singlePresets = [5, 10, 20];
    const combinedPresets = [5, 10, 20, 30];

    const setupPrintList =
      quizScope === 'single'
        ? lesson.quiz
        : selectedCombinedLessons.flatMap((l) => l.quiz);
    const setupPrintTitle =
      quizScope === 'combined'
        ? `آزمون ترکیبی (${selectedCombinedLessons.length} درس)`
        : `آزمون تستی: ${lesson.title}`;

    return (
      <>
      {renderPrintableQuizSheet(setupPrintTitle, setupPrintList)}
      <div className="mx-auto max-w-[920px] px-4 py-6 md:px-6 lg:py-8 no-print">
        <div className="elevation-tier-1 rounded-2xl bg-[#FAF9F6] p-5 dark:bg-[#161D24] sm:p-7">
          {/* Header */}
          <div className="flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-5 dark:border-[#27323E] md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]" />
                <span>تنظیمات و پیکربندی آزمون</span>
              </div>
              <h1 className="mt-1 truncate text-xl font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                آزمون تستی {quizScope === 'combined' ? 'ترکیبی چند درس' : lesson.title}
              </h1>
            </div>

            {/* Scope Switcher: Equal-width balanced buttons for Single Lesson vs Combined Multi-Lesson */}
            <div
              role="tablist"
              aria-label="انتخاب محدوده آزمون"
              className="grid w-full shrink-0 grid-cols-2 gap-1 rounded-xl bg-[#E2E8F0] p-1 dark:bg-[#1E293B] md:w-auto md:min-w-[336px]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={quizScope === 'single'}
                onClick={() => setQuizScope('single')}
                className={`flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs transition-all ${
                  quizScope === 'single'
                    ? 'border-[#CBD5E1] bg-white font-semibold text-[#0D9488] shadow-xs dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                    : 'border-transparent font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                <span>همین فصل</span>
                <span className="rounded-md bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#475569] tabular-nums dark:bg-[#27323E] dark:text-[#CBD5E1]">
                  {lesson.quiz.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={quizScope === 'combined'}
                onClick={() => setQuizScope('combined')}
                className={`flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs transition-all ${
                  quizScope === 'combined'
                    ? 'border-[#CBD5E1] bg-white font-semibold text-[#0D9488] shadow-xs dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                    : 'border-transparent font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8] dark:hover:text-[#F1F5F9]'
                }`}
              >
                <Layers3 className="h-3.5 w-3.5 shrink-0" />
                <span>آزمون ترکیبی</span>
                <span className="rounded-md bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#475569] tabular-nums dark:bg-[#27323E] dark:text-[#CBD5E1]">
                  {lessonsWithQuiz.length}
                </span>
              </button>
            </div>
          </div>

          {/* Quiz Mode & Shuffle Controls */}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Instant vs Exam Mode */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
              <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                نحوه برگزاری آزمون
              </span>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('instant')}
                  className={`rounded-lg border px-3 py-2.5 text-right transition-colors ${
                    mode === 'instant'
                      ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                      : 'border-[#E2E8F0] bg-[#FAF9F6] text-[#475569] hover:border-[#CBD5E1] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]'
                  }`}
                >
                  <div className="text-xs font-bold">بازخورد آنی</div>
                  <div className="mt-0.5 text-[11px] opacity-80">نمایش پاسخ پس از هر سوال</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('exam')}
                  className={`rounded-lg border px-3 py-2.5 text-right transition-colors ${
                    mode === 'exam'
                      ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                      : 'border-[#E2E8F0] bg-[#FAF9F6] text-[#475569] hover:border-[#CBD5E1] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]'
                  }`}
                >
                  <div className="text-xs font-bold">حالت آزمون</div>
                  <div className="mt-0.5 text-[11px] opacity-80">زمان‌دار + کارنامه نهایی</div>
                </button>
              </div>
            </div>

            {/* Shuffle Toggle Card */}
            <div className="flex flex-col justify-between rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
              <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                ترتیب نمایش سوالات
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={shuffleEnabled}
                onClick={() => setShuffleEnabled((v) => !v)}
                className={`mt-2.5 flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-right transition-colors ${
                  shuffleEnabled
                    ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                    : 'border-[#E2E8F0] bg-[#FAF9F6] text-[#475569] hover:border-[#CBD5E1] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Shuffle className="h-4 w-4 shrink-0 -scale-x-100" />
                  <div>
                    <div className="text-xs font-bold">تصادفی / بر زدن سوالات</div>
                    <div className="mt-0.5 text-[11px] opacity-80">
                      {shuffleEnabled
                        ? 'سوالات به صورت تصادفی انتخاب و مرتب می‌شوند'
                        : 'سوالات به ترتیب اصلی نمایش داده می‌شوند'}
                    </div>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    shuffleEnabled
                      ? 'bg-[#0D9488] text-white'
                      : 'bg-[#E2E8F0] text-[#64748B] dark:bg-[#27323E] dark:text-[#94A3B8]'
                  }`}
                >
                  {shuffleEnabled ? 'روشن' : 'خاموش'}
                </span>
              </button>
            </div>
          </div>

          {/* Scope-Specific Question Selection */}
          {quizScope === 'single' ? (
            lesson.quiz.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-[#CBD5E1] bg-white p-6 text-center dark:border-[#364554] dark:bg-[#1C252E]">
                <p className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  این فصل هنوز سوال تستی ندارد
                </p>
                <p className="mt-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                  می‌توانید فایل آزمون (.json) وارد کنید یا از تب «آزمون ترکیبی» سایر درس‌ها را انتخاب نمایید.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {onOpenImportModal && (
                    <button
                      type="button"
                      onClick={onOpenImportModal}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      <span>ورود فایل آزمون (.json)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setQuizScope('combined')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#0D9488]/40 bg-[#F0FDFA] px-3.5 py-2 text-xs font-semibold text-[#0F766E] dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF]"
                  >
                    <Layers3 className="h-3.5 w-3.5" />
                    <span>ساخت آزمون ترکیبی از سایر درس‌ها</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                    تعداد سوالات آزمون
                  </span>
                  <span className="text-xs text-[#64748B] tabular-nums dark:text-[#94A3B8]">
                    موجود در این فصل: <strong className="text-[#0F172A] dark:text-[#F8FAFC]">{lesson.quiz.length}</strong> سوال
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {singlePresets.map((preset) => {
                    const disabled = preset > lesson.quiz.length;
                    const active = singleCountMode === 'custom' && singleCustomCount === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSingleCountMode('custom');
                          setSingleCustomCount(preset);
                        }}
                        className={`rounded-lg border px-3.5 py-2 font-mono text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                          active
                            ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                            : 'border-[#E2E8F0] bg-[#FAF9F6] text-[#334155] hover:border-[#CBD5E1] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]'
                        }`}
                      >
                        {preset} سوال
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setSingleCountMode('all')}
                    className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
                      singleCountMode === 'all'
                        ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                        : 'border-[#E2E8F0] bg-[#FAF9F6] text-[#334155] hover:border-[#CBD5E1] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]'
                    }`}
                  >
                    همه ({lesson.quiz.length})
                  </button>

                  <div className="flex items-center gap-2 rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-2.5 py-1 dark:border-[#364554] dark:bg-[#161D24]">
                    <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">دلخواه:</span>
                    <input
                      type="number"
                      min={1}
                      max={lesson.quiz.length}
                      value={singleCountMode === 'all' ? lesson.quiz.length : singleCustomCount}
                      onFocus={() => setSingleCountMode('custom')}
                      onChange={(e) => {
                        setSingleCountMode('custom');
                        const val = parseInt(e.target.value, 10);
                        setSingleCustomCount(
                          Number.isFinite(val) ? Math.max(1, Math.min(lesson.quiz.length, val)) : 1
                        );
                      }}
                      className="ltr-inline w-16 rounded border border-[#E2E8F0] bg-white px-2 py-1 text-center font-mono text-xs font-semibold text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#F8FAFC]"
                    />
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Combined Multi-Lesson Configurator */
            <div className="mt-5 space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-[#27323E] dark:bg-[#1C252E]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
                  انتخاب درس‌ها برای آزمون ترکیبی
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg bg-[#F1F5F9] p-0.5 dark:bg-[#161D24]">
                    <button
                      type="button"
                      onClick={() => setCombinedAllocationMode('per-lesson')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        combinedAllocationMode === 'per-lesson'
                          ? 'bg-white font-semibold text-[#0F766E] shadow-xs dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                          : 'text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      تعداد از هر درس
                    </button>
                    <button
                      type="button"
                      onClick={() => setCombinedAllocationMode('total')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        combinedAllocationMode === 'total'
                          ? 'bg-white font-semibold text-[#0F766E] shadow-xs dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                          : 'text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      تعداد کل ترکیبی
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-[280px] space-y-2 overflow-y-auto pl-1">
                {lessonsWithQuiz.map((item) => {
                  const isSelected = selectedLessonIds.includes(item.id);
                  const countForItem = Math.max(
                    1,
                    Math.min(item.quiz.length, perLessonCounts[item.id] ?? Math.min(5, item.quiz.length))
                  );
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                        isSelected
                          ? 'border-[#0D9488]/50 bg-[#F0FDFA]/60 dark:border-[#14B8A6]/45 dark:bg-[#0F2928]/45'
                          : 'border-[#E2E8F0] bg-[#FAF9F6] opacity-70 dark:border-[#27323E] dark:bg-[#161D24]'
                      }`}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCombinedLesson(item.id)}
                          className="h-4 w-4 rounded border-[#CBD5E1] accent-[#0D9488]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#0F766E] dark:bg-[#1C252E] dark:text-[#2DD4BF]">
                              فصل {item.chapterNumber}
                            </span>
                            <span className="truncate text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">
                              {item.title}
                            </span>
                          </div>
                          <span className="mt-0.5 block text-[11px] text-[#64748B] tabular-nums dark:text-[#94A3B8]">
                            {item.quiz.length} سوال موجود
                          </span>
                        </div>
                      </label>

                      {isSelected && combinedAllocationMode === 'per-lesson' && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjustLessonCount(item.id, item.quiz.length, -1)}
                            disabled={countForItem <= 1}
                            aria-label="کاهش تعداد سوال"
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#CBD5E1] bg-white text-[#475569] hover:border-[#0D9488] disabled:opacity-35 dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={item.quiz.length}
                            value={countForItem}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setPerLessonCounts((prev) => ({
                                ...prev,
                                [item.id]: Number.isFinite(val)
                                  ? Math.max(1, Math.min(item.quiz.length, val))
                                  : 1,
                              }));
                            }}
                            className="ltr-inline h-7 w-12 rounded-md border border-[#CBD5E1] bg-white text-center font-mono text-xs font-semibold text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F8FAFC]"
                          />
                          <button
                            type="button"
                            onClick={() => adjustLessonCount(item.id, item.quiz.length, 1)}
                            disabled={countForItem >= item.quiz.length}
                            aria-label="افزایش تعداد سوال"
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#CBD5E1] bg-white text-[#475569] hover:border-[#0D9488] disabled:opacity-35 dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPerLessonCounts((prev) => ({
                                ...prev,
                                [item.id]: item.quiz.length,
                              }))
                            }
                            className="rounded-md px-2 py-1 text-[10px] font-medium text-[#0F766E] hover:bg-[#CCFBF1]/60 dark:text-[#2DD4BF] dark:hover:bg-[#134E4A]/50"
                          >
                            همه
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {combinedAllocationMode === 'total' && selectedCombinedLessons.length > 0 && (
                <div className="border-t border-[#E2E8F0] pt-3 dark:border-[#27323E]">
                  <div className="mb-2 flex items-center justify-between text-xs text-[#64748B] dark:text-[#94A3B8]">
                    <span>تعداد کل سوالات ترکیبی (توزیع متوازن بین درس‌های انتخاب‌شده)</span>
                    <span className="tabular-nums">حداکثر: {combinedMaxAvailable} سوال</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {combinedPresets.map((preset) => {
                      const disabled = preset > combinedMaxAvailable;
                      const active = combinedTotalMode === 'custom' && combinedTotalCount === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setCombinedTotalMode('custom');
                            setCombinedTotalCount(preset);
                          }}
                          className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors disabled:opacity-35 ${
                            active
                              ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                              : 'border-[#E2E8F0] bg-[#FAF9F6] text-[#334155] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setCombinedTotalMode('all')}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        combinedTotalMode === 'all'
                          ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                          : 'border-[#E2E8F0] bg-[#FAF9F6] text-[#334155] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]'
                      }`}
                    >
                      همه ({combinedMaxAvailable})
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={combinedMaxAvailable}
                      value={combinedTotalMode === 'all' ? combinedMaxAvailable : combinedTotalCount}
                      onFocus={() => setCombinedTotalMode('custom')}
                      onChange={(e) => {
                        setCombinedTotalMode('custom');
                        const val = parseInt(e.target.value, 10);
                        setCombinedTotalCount(
                          Number.isFinite(val) ? Math.max(1, Math.min(combinedMaxAvailable, val)) : 1
                        );
                      }}
                      className="ltr-inline w-16 rounded-lg border border-[#CBD5E1] bg-white px-2 py-1.5 text-center font-mono text-xs font-semibold text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Launch Footer */}
          <div className="mt-6 flex flex-col items-stretch justify-between gap-3 border-t border-[#E2E8F0] pt-5 dark:border-[#27323E] sm:flex-row sm:items-center">
            <div className="text-xs text-[#475569] tabular-nums dark:text-[#94A3B8]">
              {plannedQuestionCount > 0 ? (
                <>
                  آماده برگزاری{' '}
                  <strong className="font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                    {plannedQuestionCount} سوال
                  </strong>{' '}
                  {quizScope === 'combined'
                    ? `از ${selectedCombinedLessons.length} درس`
                    : `از فصل ${lesson.chapterNumber}`}{' '}
                  · {mode === 'instant' ? 'بازخورد آنی' : 'حالت آزمون'}
                  {shuffleEnabled ? ' · ترتیب تصادفی' : ''}
                </>
              ) : (
                <span>حداقل یک درس دارای سوال انتخاب کنید.</span>
              )}
            </div>

            <HoverTooltip label="شروع آزمون" placement="top" align="end">
              <button
                type="button"
                disabled={plannedQuestionCount === 0}
                onClick={startConfiguredQuiz}
                aria-label="شروع آزمون"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0D9488] text-white transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-4.5 w-4.5 -scale-x-100" />
              </button>
            </HoverTooltip>
          </div>
        </div>
      </div>
      </>
    );
  }

  /* ===================== PHASE 2: ACTIVE QUIZ RUNNER ===================== */
  const selectedIds = answers[activeQuestion.sessionKey] ?? [];
  const isRevealed =
    (mode === 'instant' && Boolean(revealedInstant[activeQuestion.sessionKey])) ||
    (mode === 'exam' && examSubmitted);
  const isCorrectAnswer = isRevealed && arraysMatch(selectedIds, activeQuestion.correctOptionIds);
  const isFlagged = flaggedIds.has(activeQuestion.sessionKey);

  return (
    <>
    {renderPrintableQuizSheet(
      isCombinedSession ? activeScopeLabel : `آزمون تستی: ${lesson.title}`,
      sessionQuestions
    )}
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6 lg:py-8 no-print">
      {/* Mode Header Strip */}
      <div className="elevation-tier-1 mb-6 flex flex-col justify-between gap-4 rounded-2xl bg-white p-5 dark:bg-[#1C252E] sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
            {isCombinedSession ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FDFA] px-2 py-0.5 font-semibold text-[#0F766E] dark:bg-[#0F2928] dark:text-[#2DD4BF]">
                <Layers3 className="h-3 w-3" />
                <span>{activeScopeLabel}</span>
              </span>
            ) : (
              <>
                <span className="ltr-inline font-mono font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                  {lesson.code}
                </span>
                <span aria-hidden="true">·</span>
                <span>ارزیابی مفهومی فصل {lesson.chapterNumber}</span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {isCombinedSession ? 'آزمون ترکیبی چند درس' : `آزمون تستی: ${lesson.title}`}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#161D24]">
            <button
              type="button"
              onClick={() => switchActiveMode('instant')}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                mode === 'instant'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
              }`}
            >
              بازخورد آنی
            </button>
            <button
              type="button"
              onClick={() => switchActiveMode('exam')}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                mode === 'exam'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
              }`}
            >
              حالت آزمون
            </button>
          </div>

          {mode === 'exam' && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-[#FAF9F6] px-3 py-1.5 font-mono text-xs font-medium text-[#334155] tabular-nums dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]">
              <Clock className="h-3.5 w-3.5 text-[#0D9488]" />
              <span className="ltr-inline">{formatTimer(elapsedSec)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => resetActiveSession(true)}
            title="بر زدن تصادفی سوالات و شروع مجدد"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#475569] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1]"
          >
            <Shuffle className="h-3.5 w-3.5 -scale-x-100" />
            <span>بر زدن</span>
          </button>

          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#475569] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>تنظیمات</span>
          </button>

          <button
            type="button"
            onClick={() => resetActiveSession(false)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#475569] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">شروع مجدد</span>
          </button>
        </div>
      </div>

      {/* Exam Final Score Banner */}
      {mode === 'exam' && examSubmitted && (
        <div className="elevation-tier-2 mb-6 flex flex-col justify-between gap-4 rounded-2xl border-[#0D9488]/30 bg-[#F0FDFA] p-5 dark:border-[#14B8A6]/30 dark:bg-[#0F2928]/70 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0D9488] text-white">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                کارنامه آزمون ثبت شد
              </h2>
              <p className="mt-0.5 text-xs text-[#334155] tabular-nums dark:text-[#CBD5E1]">
                پاسخ صحیح: <strong>{scoreSummary.correct}</strong> از {scoreSummary.total} سوال · زمان ثبت‌شده:{' '}
                <span className="ltr-inline font-mono">{formatTimer(elapsedSec)}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left">
              <span className="block font-mono text-2xl font-bold text-[#0F766E] tabular-nums dark:text-[#2DD4BF]">
                {scoreSummary.percent}%
              </span>
              <span className="text-[11px] text-[#475569] dark:text-[#94A3B8]">نمره نهایی</span>
            </div>
            <button
              type="button"
              onClick={() => resetActiveSession(shuffleEnabled)}
              className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
            >
              آزمون مجدد
            </button>
          </div>
        </div>
      )}

      {/* Main Split: Question Card + Progress & Flag Navigator */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
        {/* Question Container */}
        <div className="elevation-tier-1 rounded-2xl bg-[#FAF9F6] p-6 dark:bg-[#161D24] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4 dark:border-[#27323E]">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums dark:text-[#F8FAFC]">
                سوال {currentIdx + 1} از {sessionQuestions.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                {activeQuestion.type === 'single'
                  ? 'تک‌گزینه‌ای (یک پاسخ)'
                  : 'چندگزینه‌ای (انتخاب چند مورد)'}
              </span>
              {isCombinedSession && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-[#334155] dark:bg-[#1C252E] dark:text-[#CBD5E1]">
                    فصل {activeQuestion.sourceChapterNumber}: {activeQuestion.sourceLessonTitle}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {onUpdateQuizQuestion && (
                <button
                  type="button"
                  onClick={() => openEditQuestion(activeQuestion)}
                  title="ویرایش این سوال"
                  aria-label="ویرایش این سوال"
                  className="flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-medium text-[#475569] transition-colors hover:border-[#0D9488] hover:text-[#0F766E] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">ویرایش</span>
                </button>
              )}

              {onDeleteQuizQuestion && confirmDeleteQuestionKey !== activeQuestion.sessionKey && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteQuestionKey(activeQuestion.sessionKey)}
                  title="حذف این سوال"
                  aria-label="حذف این سوال"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:border-[#FCA5A5] hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#94A3B8] dark:hover:border-[#B91C1C]/60 dark:hover:bg-[#7F1D1D]/30 dark:hover:text-[#F87171]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}

              {onDeleteQuizQuestion && confirmDeleteQuestionKey === activeQuestion.sessionKey && (
                <div className="flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1 text-[11px] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/35">
                  <button
                    type="button"
                    onClick={() => handleConfirmDeleteQuestion(activeQuestion)}
                    className="font-semibold text-[#DC2626] hover:underline dark:text-[#FCA5A5]"
                  >
                    حذف قطعی
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteQuestionKey(null)}
                    className="text-[#64748B] dark:text-[#CBD5E1]"
                  >
                    لغو
                  </button>
                </div>
              )}

              {mode === 'exam' && (
                <button
                  type="button"
                  onClick={() => toggleFlag(activeQuestion.sessionKey)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isFlagged
                      ? 'border-[#FCD34D] bg-[#FFFBEB] text-[#B45309] dark:border-[#B45309] dark:bg-[#451A03]/40 dark:text-[#FBBF24]'
                      : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1] hover:text-[#1E293B] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#94A3B8]'
                  }`}
                >
                  <Flag className={`h-3.5 w-3.5 ${isFlagged ? 'fill-current' : ''}`} />
                  <span>{isFlagged ? 'نشانه‌گذاری شده' : 'نشانه‌گذاری برای مرور'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Question Stem */}
          <h2 className="mt-5 text-lg font-semibold leading-[1.85] text-[#0F172A] dark:text-[#F8FAFC]">
            <RichMathText text={activeQuestion.prompt} />
          </h2>

          {activeQuestion.promptFormula && (
            <div className="mt-4 rounded-lg border border-[#0D9488]/20 bg-[#F0FDFA] px-4 py-3 text-sm font-medium text-[#0F172A] dark:border-[#14B8A6]/25 dark:bg-[#0F2928] dark:text-[#F1F5F9]">
              <FormulaDisplay formula={activeQuestion.promptFormula} />
            </div>
          )}

          {/* Stacked Response Options */}
          <div className="mt-6 space-y-3">
            {activeQuestion.options.map((opt) => {
              const isSelected = selectedIds.includes(opt.id);
              const isOptionCorrect = activeQuestion.correctOptionIds.includes(opt.id);

              let cardClasses =
                'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] dark:border-[#27323E] dark:bg-[#1C252E] dark:hover:border-[#364554]';
              let statusLabel: React.ReactNode = null;

              if (isRevealed) {
                if (isOptionCorrect) {
                  cardClasses =
                    'border-[#6EE7B7] bg-[#ECFDF5] dark:border-[#047857] dark:bg-[#064E3B]/35';
                  statusLabel = (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#047857] dark:text-[#34D399]">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>گزینه صحیح</span>
                    </span>
                  );
                } else if (isSelected && !isOptionCorrect) {
                  cardClasses =
                    'border-[#FCA5A5] bg-[#FEF2F2] dark:border-[#B91C1C] dark:bg-[#7F1D1D]/30';
                  statusLabel = (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#DC2626] dark:text-[#F87171]">
                      <XCircle className="h-4 w-4" />
                      <span>انتخاب نادرست</span>
                    </span>
                  );
                }
              } else if (isSelected) {
                cardClasses =
                  mode === 'exam'
                    ? 'border-[#0D9488] bg-[#F1F5F9] dark:border-[#14B8A6] dark:bg-[#24303C]'
                    : 'border-[#0D9488] bg-[#F0FDFA] dark:border-[#14B8A6] dark:bg-[#0F2928]/60';
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectOption(activeQuestion, opt.id)}
                  disabled={isRevealed}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-right transition-all duration-150 ${cardClasses} ${
                    isRevealed ? 'cursor-default' : 'cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {activeQuestion.type === 'single' ? (
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          isSelected
                            ? 'border-[#0D9488] bg-white dark:bg-[#161D24]'
                            : 'border-[#CBD5E1] bg-white dark:border-[#475569] dark:bg-[#161D24]'
                        }`}
                      >
                        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[#0D9488]" />}
                      </span>
                    ) : (
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                          isSelected
                            ? 'border-[#0D9488] bg-[#0D9488] text-white'
                            : 'border-[#CBD5E1] bg-white dark:border-[#475569] dark:bg-[#161D24]'
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </span>
                    )}

                    <span className="text-sm font-medium leading-7 text-[#1E293B] dark:text-[#E2E8F0]">
                      <RichMathText text={opt.text} />
                    </span>
                  </div>

                  {statusLabel}
                </button>
              );
            })}
          </div>

          {/* Confirm Button for Multi-Select in Instant Mode */}
          {mode === 'instant' && activeQuestion.type === 'multi' && !isRevealed && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => handleConfirmMultiInstant(activeQuestion)}
                disabled={selectedIds.length === 0}
                className="rounded-lg bg-[#0D9488] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-45"
              >
                بررسی پاسخ‌های انتخاب‌شده
              </button>
            </div>
          )}

          {/* Collapsible Persian Explanation Drawer */}
          {isRevealed && (
            <div
              className={`mt-6 overflow-hidden rounded-xl border ${
                isCorrectAnswer
                  ? 'border-[#6EE7B7] bg-[#ECFDF5]/70 dark:border-[#047857]/70 dark:bg-[#064E3B]/25'
                  : 'border-[#FCA5A5] bg-[#FEF2F2]/70 dark:border-[#B91C1C]/70 dark:bg-[#7F1D1D]/20'
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenExplanation((prev) => ({
                    ...prev,
                    [activeQuestion.sessionKey]: !prev[activeQuestion.sessionKey],
                  }))
                }
                className="flex w-full items-center justify-between px-4 py-3 text-right"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {isCorrectAnswer ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-[#059669] dark:text-[#34D399]" />
                      <span className="text-[#047857] dark:text-[#34D399]">
                        پاسخ شما کاملاً صحیح است — توضیح تشریحی
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-[#DC2626] dark:text-[#F87171]" />
                      <span className="text-[#B91C1C] dark:text-[#F87171]">
                        پاسخ نیازمند اصلاح است — مشاهده تحلیل تشریحی
                      </span>
                    </>
                  )}
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-[#64748B] transition-transform ${
                    openExplanation[activeQuestion.sessionKey] ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openExplanation[activeQuestion.sessionKey] && (
                <div className="border-t border-black/5 px-4 pb-4 pt-3 dark:border-white/10">
                  <p className="text-sm leading-8 text-[#1E293B] dark:text-[#E2E8F0]">
                    <RichMathText text={activeQuestion.explanation} />
                  </p>
                  {activeQuestion.sectionId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isCombinedSession) {
                          onJumpToLessonSection(
                            activeQuestion.sourceLessonId,
                            activeQuestion.sectionId!
                          );
                        } else {
                          onJumpToSection(activeQuestion.sectionId!);
                        }
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:underline dark:text-[#2DD4BF]"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>مرور منبع این سوال در جزوه</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Question Navigation Bar */}
          <div className="mt-7 flex items-center justify-between border-t border-[#E2E8F0] pt-5 dark:border-[#27323E]">
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-4 text-xs font-semibold text-[#334155] transition-colors hover:border-[#94A3B8] disabled:opacity-40 dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
            >
              <ChevronRight className="h-4 w-4" />
              <span>سوال قبلی</span>
            </button>

            {currentIdx < sessionQuestions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(sessionQuestions.length - 1, i + 1))}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#0F172A] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#1E293B] dark:bg-[#0D9488] dark:hover:bg-[#0F766E]"
              >
                <span>سوال بعدی</span>
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : mode === 'exam' && !examSubmitted ? (
              <button
                type="button"
                onClick={handleSubmitExam}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#0D9488] px-5 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <span>ثبت نهایی و مشاهده کارنامه</span>
              </button>
            ) : (
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                پایان سوالات این آزمون
              </span>
            )}
          </div>
        </div>

        {/* Right/Left Progress & Question Palette Rail */}
        <aside className="elevation-tier-1 sticky top-[84px] rounded-2xl bg-white p-5 dark:bg-[#1C252E]">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 dark:border-[#27323E]">
            <h3 className="text-xs font-semibold text-[#475569] dark:text-[#94A3B8]">
              نقشه سوالات
            </h3>
            <span className="font-mono text-xs font-semibold text-[#0F172A] tabular-nums dark:text-[#F8FAFC]">
              {scoreSummary.answered} / {scoreSummary.total} پاسخ
            </span>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {sessionQuestions.map((q, idx) => {
              const qSelected = answers[q.sessionKey] ?? [];
              const qRevealed =
                (mode === 'instant' && Boolean(revealedInstant[q.sessionKey])) ||
                (mode === 'exam' && examSubmitted);
              const qCorrect = qRevealed && arraysMatch(qSelected, q.correctOptionIds);
              const qFlagged = flaggedIds.has(q.sessionKey);
              const isCurrent = idx === currentIdx;

              let btnStyle =
                'border-[#E2E8F0] bg-[#FAF9F6] text-[#334155] hover:border-[#94A3B8] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#CBD5E1]';
              if (qRevealed) {
                btnStyle = qCorrect
                  ? 'border-[#6EE7B7] bg-[#ECFDF5] text-[#047857] dark:border-[#047857] dark:bg-[#064E3B]/40 dark:text-[#34D399]'
                  : 'border-[#FCA5A5] bg-[#FEF2F2] text-[#DC2626] dark:border-[#B91C1C] dark:bg-[#7F1D1D]/35 dark:text-[#F87171]';
              } else if (qSelected.length > 0) {
                btnStyle =
                  'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]';
              }

              return (
                <button
                  key={q.sessionKey}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`relative flex h-10 items-center justify-center rounded-lg border font-mono text-xs font-semibold tabular-nums transition-all ${btnStyle} ${
                    isCurrent ? 'ring-2 ring-[#0D9488] ring-offset-1 dark:ring-offset-[#1C252E]' : ''
                  }`}
                >
                  {idx + 1}
                  {qFlagged && (
                    <span
                      aria-label="نشانه‌گذاری شده"
                      className="absolute -left-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#D97706] text-white"
                    >
                      <Flag className="h-2 w-2 fill-current" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-2 border-t border-[#E2E8F0] pt-4 text-xs dark:border-[#27323E]">
            <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
              <span>پاسخ داده‌شده</span>
              <span className="font-mono font-medium text-[#0F172A] tabular-nums dark:text-[#F8FAFC]">
                {scoreSummary.answered}
              </span>
            </div>
            {(mode === 'instant' || examSubmitted) && (
              <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
                <span>پاسخ صحیح</span>
                <span className="font-mono font-semibold text-[#059669] tabular-nums dark:text-[#34D399]">
                  {scoreSummary.correct} ({scoreSummary.percent}%)
                </span>
              </div>
            )}
            {mode === 'exam' && (
              <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
                <span>نشانه‌گذاری‌شده</span>
                <span className="font-mono font-medium text-[#D97706] tabular-nums dark:text-[#FBBF24]">
                  {flaggedIds.size}
                </span>
              </div>
            )}
          </div>

          {mode === 'exam' && !examSubmitted && (
            <button
              type="button"
              onClick={handleSubmitExam}
              className="mt-5 w-full rounded-lg bg-[#0D9488] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
            >
              پایان آزمون و تصحیح
            </button>
          )}
        </aside>
      </div>

      {/* Single-Question Edit Modal */}
      {editingQuestion && onUpdateQuizQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#0F172A]/45 backdrop-blur-[2px]"
            onClick={() => setEditingQuestion(null)}
          />
          <form
            onSubmit={handleSaveEditedQuestion}
            role="dialog"
            aria-modal="true"
            aria-label="ویرایش سوال آزمون"
            className="elevation-tier-3 relative z-10 flex max-h-[90vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white dark:border-[#364554] dark:bg-[#1C252E]"
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#27323E]">
              <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                ویرایش سوال تستی
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                aria-label="بستن"
                className="rounded-md p-1 text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#475569] dark:text-[#CBD5E1]">نوع سوال:</span>
                <button
                  type="button"
                  onClick={() =>
                    setEditingQuestion((prev) =>
                      prev
                        ? {
                            ...prev,
                            type: 'single',
                            correctOptionIds: prev.correctOptionIds.slice(0, 1),
                          }
                        : null
                    )
                  }
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                    editingQuestion.type === 'single'
                      ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                      : 'border-[#E2E8F0] text-[#64748B] dark:border-[#27323E] dark:text-[#94A3B8]'
                  }`}
                >
                  تک‌گزینه‌ای
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditingQuestion((prev) => (prev ? { ...prev, type: 'multi' } : null))
                  }
                  className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                    editingQuestion.type === 'multi'
                      ? 'border-[#0D9488] bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                      : 'border-[#E2E8F0] text-[#64748B] dark:border-[#27323E] dark:text-[#94A3B8]'
                  }`}
                >
                  چندگزینه‌ای
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  متن سوال *
                </label>
                <textarea
                  required
                  rows={2}
                  value={editingQuestion.prompt}
                  onChange={(e) =>
                    setEditingQuestion((prev) =>
                      prev ? { ...prev, prompt: e.target.value } : null
                    )
                  }
                  className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  فرمول صورت سوال (اختیاری)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editingQuestion.promptFormula}
                  onChange={(e) =>
                    setEditingQuestion((prev) =>
                      prev ? { ...prev, promptFormula: e.target.value } : null
                    )
                  }
                  className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                    گزینه‌ها (گزینه‌های صحیح را تیک بزنید)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingQuestion((prev) =>
                        prev
                          ? {
                              ...prev,
                              options: [
                                ...prev.options,
                                { id: `opt-${Date.now().toString(36)}-${prev.options.length}`, text: '' },
                              ],
                            }
                          : null
                      )
                    }
                    className="flex items-center gap-1 text-xs font-semibold text-[#0D9488] hover:underline dark:text-[#2DD4BF]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>افزودن گزینه</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {editingQuestion.options.map((opt, idx) => {
                    const isCorrect = editingQuestion.correctOptionIds.includes(opt.id);
                    return (
                      <div key={opt.id} className="flex items-center gap-2">
                        <input
                          type={editingQuestion.type === 'single' ? 'radio' : 'checkbox'}
                          name="edit-quiz-correct"
                          checked={isCorrect}
                          onChange={() => {
                            setEditingQuestion((prev) => {
                              if (!prev) return null;
                              if (prev.type === 'single') {
                                return { ...prev, correctOptionIds: [opt.id] };
                              }
                              const exists = prev.correctOptionIds.includes(opt.id);
                              const nextIds = exists
                                ? prev.correctOptionIds.filter((id) => id !== opt.id)
                                : [...prev.correctOptionIds, opt.id];
                              return { ...prev, correctOptionIds: nextIds };
                            });
                          }}
                          title="علامت‌گذاری به عنوان گزینه صحیح"
                          className="h-4 w-4 shrink-0 accent-[#0D9488]"
                        />
                        <input
                          type="text"
                          required
                          value={opt.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingQuestion((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    options: prev.options.map((o) =>
                                      o.id === opt.id ? { ...o, text: val } : o
                                    ),
                                  }
                                : null
                            );
                          }}
                          placeholder={`متن گزینه ${idx + 1}...`}
                          className="archival-input flex-1 border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                        />
                        {editingQuestion.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingQuestion((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      options: prev.options.filter((o) => o.id !== opt.id),
                                      correctOptionIds: prev.correctOptionIds.filter(
                                        (id) => id !== opt.id
                                      ),
                                    }
                                  : null
                              )
                            }
                            aria-label="حذف گزینه"
                            className="rounded p-1.5 text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  توضیح تشریحی پاسخ
                </label>
                <textarea
                  rows={3}
                  value={editingQuestion.explanation}
                  onChange={(e) =>
                    setEditingQuestion((prev) =>
                      prev ? { ...prev, explanation: e.target.value } : null
                    )
                  }
                  className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#E2E8F0] px-5 py-3.5 dark:border-[#27323E]">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1]"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
              >
                ذخیره تغییرات سوال
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
    </>
  );
};
