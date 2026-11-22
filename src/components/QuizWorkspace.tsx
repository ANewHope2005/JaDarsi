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
} from 'lucide-react';
import { Lesson, QuizQuestion } from '../types/study';
import { FormulaDisplay, RichMathText } from '../utils/latexText';

interface QuizWorkspaceProps {
  lesson: Lesson;
  onJumpToSection: (sectionId: string) => void;
  onSaveQuizBestScore: (lessonId: string, scorePercent: number) => void;
  onOpenImportModal?: () => void;
}

type QuizMode = 'instant' | 'exam';

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

export const QuizWorkspace: React.FC<QuizWorkspaceProps> = ({
  lesson,
  onJumpToSection,
  onSaveQuizBestScore,
  onOpenImportModal,
}) => {
  const [mode, setMode] = useState<QuizMode>('instant');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [revealedInstant, setRevealedInstant] = useState<Record<string, boolean>>({});
  const [openExplanation, setOpenExplanation] = useState<Record<string, boolean>>({});
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [examSubmitted, setExamSubmitted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const questions = lesson.quiz;
  const activeQuestion: QuizQuestion | undefined = questions[currentIdx];

  useEffect(() => {
    setCurrentIdx(0);
    setAnswers({});
    setRevealedInstant({});
    setOpenExplanation({});
    setFlaggedIds(new Set());
    setExamSubmitted(false);
    setElapsedSec(0);
  }, [lesson.id, lesson.quiz]);

  // Exam timer
  useEffect(() => {
    if (mode !== 'exam' || examSubmitted) return;
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [mode, examSubmitted]);

  const switchMode = (nextMode: QuizMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setCurrentIdx(0);
    setAnswers({});
    setRevealedInstant({});
    setOpenExplanation({});
    setFlaggedIds(new Set());
    setExamSubmitted(false);
    setElapsedSec(0);
  };

  const resetQuiz = () => {
    setCurrentIdx(0);
    setAnswers({});
    setRevealedInstant({});
    setOpenExplanation({});
    setFlaggedIds(new Set());
    setExamSubmitted(false);
    setElapsedSec(0);
  };

  const handleSelectOption = (q: QuizQuestion, optionId: string) => {
    if (mode === 'exam' && examSubmitted) return;
    if (mode === 'instant' && revealedInstant[q.id]) return;

    if (q.type === 'single') {
      setAnswers((prev) => ({ ...prev, [q.id]: [optionId] }));
      if (mode === 'instant') {
        setRevealedInstant((prev) => ({ ...prev, [q.id]: true }));
        setOpenExplanation((prev) => ({ ...prev, [q.id]: true }));
      }
    } else {
      setAnswers((prev) => {
        const current = prev[q.id] ?? [];
        const exists = current.includes(optionId);
        const updated = exists ? current.filter((id) => id !== optionId) : [...current, optionId];
        return { ...prev, [q.id]: updated };
      });
    }
  };

  const handleConfirmMultiInstant = (q: QuizQuestion) => {
    if ((answers[q.id]?.length ?? 0) === 0) return;
    setRevealedInstant((prev) => ({ ...prev, [q.id]: true }));
    setOpenExplanation((prev) => ({ ...prev, [q.id]: true }));
  };

  const toggleFlag = (qId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const scoreSummary = useMemo(() => {
    let correct = 0;
    let answered = 0;
    for (const q of questions) {
      const selected = answers[q.id] ?? [];
      if (selected.length > 0) answered++;
      if (arraysMatch(selected, q.correctOptionIds)) correct++;
    }
    const percent = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    return { correct, answered, total: questions.length, percent };
  }, [questions, answers]);

  const handleSubmitExam = () => {
    setExamSubmitted(true);
    const expanded: Record<string, boolean> = {};
    questions.forEach((q) => {
      expanded[q.id] = true;
    });
    setOpenExplanation(expanded);
    onSaveQuizBestScore(lesson.id, scoreSummary.percent);
  };

  // Save best score when all instant questions are answered
  useEffect(() => {
    if (mode === 'instant' && Object.keys(revealedInstant).length === questions.length && questions.length > 0) {
      onSaveQuizBestScore(lesson.id, scoreSummary.percent);
    }
  }, [mode, revealedInstant, questions.length, lesson.id, scoreSummary.percent, onSaveQuizBestScore]);

  if (!activeQuestion) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-12 text-center">
        <div className="elevation-tier-1 rounded-2xl bg-[#FAF9F6] px-6 py-14 dark:bg-[#161D24]">
          <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            هنوز سوال تستی برای این فصل ثبت نشده است
          </h2>
          <p className="mt-2 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
            می‌توانید یک فایل آزمون JSON شامل سوالات تک‌گزینه‌ای و چندگزینه‌ای را مستقیماً به این فصل اضافه کنید.
          </p>
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
            >
              <FileUp className="h-4 w-4" />
              <span>ورود فایل آزمون (.json)</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const selectedIds = answers[activeQuestion.id] ?? [];
  const isRevealed =
    (mode === 'instant' && Boolean(revealedInstant[activeQuestion.id])) ||
    (mode === 'exam' && examSubmitted);
  const isCorrectAnswer = isRevealed && arraysMatch(selectedIds, activeQuestion.correctOptionIds);
  const isFlagged = flaggedIds.has(activeQuestion.id);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-6 lg:py-8">
      {/* Mode Header Strip */}
      <div className="elevation-tier-1 mb-6 flex flex-col justify-between gap-4 rounded-2xl bg-white p-5 dark:bg-[#1C252E] sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span className="ltr-inline font-mono font-medium text-[#0F766E] dark:text-[#2DD4BF]">
              {lesson.code}
            </span>
            <span aria-hidden="true">·</span>
            <span>ارزیابی مفهومی فصل {lesson.chapterNumber}</span>
          </div>
          <h1 className="mt-1 text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            آزمون تستی: {lesson.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#161D24]">
            <button
              type="button"
              onClick={() => switchMode('instant')}
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
              onClick={() => switchMode('exam')}
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
            onClick={resetQuiz}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#475569] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>شروع مجدد</span>
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
              onClick={resetQuiz}
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
            <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums dark:text-[#F8FAFC]">
                سوال {currentIdx + 1} از {questions.length}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                {activeQuestion.type === 'single' ? 'تک‌گزینه‌ای (یک پاسخ)' : 'چندگزینه‌ای (انتخاب چند مورد)'}
              </span>
            </div>

            {mode === 'exam' && (
              <button
                type="button"
                onClick={() => toggleFlag(activeQuestion.id)}
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
                    {/* Custom 20px Radio Circle or 20px Checkbox Square */}
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
                    [activeQuestion.id]: !prev[activeQuestion.id],
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
                    openExplanation[activeQuestion.id] ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openExplanation[activeQuestion.id] && (
                <div className="border-t border-black/5 px-4 pb-4 pt-3 dark:border-white/10">
                  <p className="text-sm leading-8 text-[#1E293B] dark:text-[#E2E8F0]">
                    <RichMathText text={activeQuestion.explanation} />
                  </p>
                  {activeQuestion.sectionId && (
                    <button
                      type="button"
                      onClick={() => onJumpToSection(activeQuestion.sectionId!)}
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

            {currentIdx < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
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
                پایان سوالات این فصل
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
            {questions.map((q, idx) => {
              const qSelected = answers[q.id] ?? [];
              const qRevealed =
                (mode === 'instant' && Boolean(revealedInstant[q.id])) ||
                (mode === 'exam' && examSubmitted);
              const qCorrect = qRevealed && arraysMatch(qSelected, q.correctOptionIds);
              const qFlagged = flaggedIds.has(q.id);
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
                  key={q.id}
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
    </div>
  );
};
