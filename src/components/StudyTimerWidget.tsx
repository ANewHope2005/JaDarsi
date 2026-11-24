import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Coffee,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Timer,
  Watch,
  X,
} from 'lucide-react';
import { HoverTooltip } from './ui/HoverTooltip';

export type StudyTimerMode = 'stopwatch' | 'pomodoro';
export type PomodoroPhase = 'focus' | 'break';

export interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
}

export interface ReadingCheckpoint {
  sectionId: string;
  sectionTitle: string;
  progressPercent: number;
  scrollY: number;
  savedAt: string;
}

export interface LiveReadingSnapshot {
  lessonId: string;
  sectionId: string;
  sectionTitle: string;
  progressPercent: number;
  scrollY: number;
}

export interface StudyTimerController {
  mode: StudyTimerMode;
  phase: PomodoroPhase;
  isRunning: boolean;
  stopwatchSeconds: number;
  pomodoroRemainingSeconds: number;
  unsavedSessionSeconds: number;
  settings: PomodoroSettings;
  completedSessions: number;
  lastNotice: string | null;
  setMode: (mode: StudyTimerMode) => void;
  toggleRunning: () => void;
  reset: () => void;
  skipPomodoroPhase: () => void;
  updateSettings: (next: Partial<PomodoroSettings>) => void;
  markSessionSaved: (noticeText?: string) => void;
  clearNotice: () => void;
}

const POMODORO_SETTINGS_KEY = 'jadarsi_pomodoro_settings_v1';

function readPomodoroSettings(): PomodoroSettings {
  try {
    const raw = window.localStorage.getItem(POMODORO_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroSettings>;
      const focus = Math.max(1, Math.min(120, Math.round(Number(parsed.focusMinutes) || 25)));
      const brk = Math.max(1, Math.min(60, Math.round(Number(parsed.breakMinutes) || 5)));
      return { focusMinutes: focus, breakMinutes: brk };
    }
  } catch {
    // ignore storage errors
  }
  return { focusMinutes: 25, breakMinutes: 5 };
}

function playGentleChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.22); // A5
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.48);
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Audio playback optional
  }
}

export function formatClockDisplay(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatStudyDurationPersian(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe === 0) return '۰ دقیقه';
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hrs > 0) {
    return mins > 0 ? `${hrs} ساعت و ${mins} دقیقه` : `${hrs} ساعت`;
  }
  if (mins > 0) {
    return secs > 0 && mins < 10 ? `${mins} دقیقه و ${secs} ثانیه` : `${mins} دقیقه`;
  }
  return `${secs} ثانیه`;
}

/**
 * Manual-only study timer controller:
 * - Never auto-starts on page load or lesson open.
 * - Tracks `unsavedSessionSeconds` only while explicitly running in Stopwatch or Pomodoro Focus.
 * - Elapsed study time & reading checkpoint are committed explicitly when the user saves on pause.
 */
export function useStudyTimer(): StudyTimerController {
  const [mode, setModeState] = useState<StudyTimerMode>('pomodoro');
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [isRunning, setIsRunning] = useState(false);
  const [settings, setSettings] = useState<PomodoroSettings>(() => readPomodoroSettings());
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [pomodoroRemainingSeconds, setPomodoroRemainingSeconds] = useState(
    () => readPomodoroSettings().focusMinutes * 60
  );
  const [unsavedSessionSeconds, setUnsavedSessionSeconds] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [lastNotice, setLastNotice] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    try {
      window.localStorage.setItem(POMODORO_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(() => {
      if (mode === 'stopwatch') {
        setStopwatchSeconds((s) => s + 1);
        setUnsavedSessionSeconds((u) => u + 1);
      } else {
        if (phaseRef.current === 'focus') {
          setUnsavedSessionSeconds((u) => u + 1);
        }
        setPomodoroRemainingSeconds((rem) => {
          if (rem > 1) return rem - 1;

          playGentleChime();
          const curPhase = phaseRef.current;
          const curSettings = settingsRef.current;
          if (curPhase === 'focus') {
            setIsRunning(false);
            setPhase('break');
            setCompletedSessions((c) => c + 1);
            setLastNotice('جلسه تمرکز به پایان رسید! می‌توانید زمان و وضعیت مطالعه را ذخیره کنید.');
            return curSettings.breakMinutes * 60;
          } else {
            setIsRunning(false);
            setPhase('focus');
            setLastNotice('استراحت تمام شد! آماده شروع جلسه تمرکز جدید هستید.');
            return curSettings.focusMinutes * 60;
          }
        });
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, mode]);

  const setMode = useCallback((nextMode: StudyTimerMode) => {
    setModeState(nextMode);
    setIsRunning(false);
    setLastNotice(null);
  }, []);

  const toggleRunning = useCallback(() => {
    setLastNotice(null);
    setIsRunning((v) => !v);
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setLastNotice(null);
    setUnsavedSessionSeconds(0);
    if (mode === 'stopwatch') {
      setStopwatchSeconds(0);
    } else {
      setPomodoroRemainingSeconds(
        (phaseRef.current === 'focus'
          ? settingsRef.current.focusMinutes
          : settingsRef.current.breakMinutes) * 60
      );
    }
  }, [mode]);

  const skipPomodoroPhase = useCallback(() => {
    setIsRunning(false);
    setLastNotice(null);
    const nextPhase: PomodoroPhase = phaseRef.current === 'focus' ? 'break' : 'focus';
    setPhase(nextPhase);
    setPomodoroRemainingSeconds(
      (nextPhase === 'focus'
        ? settingsRef.current.focusMinutes
        : settingsRef.current.breakMinutes) * 60
    );
  }, []);

  const updateSettings = useCallback((next: Partial<PomodoroSettings>) => {
    setSettings((prev) => {
      const focusMinutes =
        next.focusMinutes !== undefined
          ? Math.max(1, Math.min(120, Math.round(next.focusMinutes)))
          : prev.focusMinutes;
      const breakMinutes =
        next.breakMinutes !== undefined
          ? Math.max(1, Math.min(60, Math.round(next.breakMinutes)))
          : prev.breakMinutes;
      const updated = { focusMinutes, breakMinutes };

      setIsRunning((running) => {
        if (!running) {
          setPomodoroRemainingSeconds(
            (phaseRef.current === 'focus' ? focusMinutes : breakMinutes) * 60
          );
        }
        return running;
      });

      return updated;
    });
  }, []);

  const markSessionSaved = useCallback((noticeText?: string) => {
    setUnsavedSessionSeconds(0);
    setLastNotice(noticeText ?? 'زمان و وضعیت مطالعه ذخیره شد.');
  }, []);

  const clearNotice = useCallback(() => setLastNotice(null), []);

  return {
    mode,
    phase,
    isRunning,
    stopwatchSeconds,
    pomodoroRemainingSeconds,
    unsavedSessionSeconds,
    settings,
    completedSessions,
    lastNotice,
    setMode,
    toggleRunning,
    reset,
    skipPomodoroPhase,
    updateSettings,
    markSessionSaved,
    clearNotice,
  };
}

interface StudyTimerWidgetProps {
  timer: StudyTimerController;
  activeLessonId?: string | null;
  activeLessonTitle?: string;
  activeLessonStudySeconds: number;
  liveReadingSnapshot?: LiveReadingSnapshot | null;
  savedCheckpoint?: ReadingCheckpoint | null;
  onSaveStudySession?: (elapsedSeconds: number) => void;
  compact?: boolean;
}

export const StudyTimerWidget: React.FC<StudyTimerWidgetProps> = ({
  timer,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focusDraft, setFocusDraft] = useState(String(timer.settings.focusMinutes));
  const [breakDraft, setBreakDraft] = useState(String(timer.settings.breakMinutes));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFocusDraft(String(timer.settings.focusMinutes));
    setBreakDraft(String(timer.settings.breakMinutes));
  }, [timer.settings.focusMinutes, timer.settings.breakMinutes]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const activeDisplaySeconds =
    timer.mode === 'stopwatch' ? timer.stopwatchSeconds : timer.pomodoroRemainingSeconds;

  const totalPhaseSeconds =
    (timer.phase === 'focus' ? timer.settings.focusMinutes : timer.settings.breakMinutes) * 60;
  const pomodoroProgress =
    timer.mode === 'pomodoro' && totalPhaseSeconds > 0
      ? Math.min(
          100,
          Math.max(0, ((totalPhaseSeconds - timer.pomodoroRemainingSeconds) / totalPhaseSeconds) * 100)
        )
      : 0;

  const isBreakPhase = timer.mode === 'pomodoro' && timer.phase === 'break';
  const hasElapsedPaused =
    !timer.isRunning &&
    (timer.mode === 'stopwatch'
      ? timer.stopwatchSeconds > 0
      : timer.pomodoroRemainingSeconds < totalPhaseSeconds);

  const applyCustomSettings = () => {
    const f = parseInt(focusDraft, 10);
    const b = parseInt(breakDraft, 10);
    timer.updateSettings({
      focusMinutes: Number.isFinite(f) ? f : timer.settings.focusMinutes,
      breakMinutes: Number.isFinite(b) ? b : timer.settings.breakMinutes,
    });
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="تایمر مطالعه (کرنومتر و پومودورو)"
        aria-label="تایمر مطالعه"
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border transition-colors ${
          compact ? 'h-7 px-2 text-[11px]' : 'h-9 px-2.5 text-xs'
        } ${
          timer.isRunning
            ? isBreakPhase
              ? 'border-[#F59E0B]/50 bg-[#FFFBEB] font-semibold text-[#B45309] dark:border-[#B45309]/60 dark:bg-[#451A03]/40 dark:text-[#FBBF24]'
              : 'border-[#0D9488]/50 bg-[#F0FDFA] font-semibold text-[#0F766E] dark:border-[#14B8A6]/50 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
            : 'border-[#E2E8F0] bg-white font-medium text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]'
        }`}
      >
        <span className="relative flex items-center justify-center">
          {timer.mode === 'stopwatch' ? (
            <Watch className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          ) : (
            <Timer className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          )}
          {timer.isRunning && (
            <span
              className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${
                isBreakPhase ? 'bg-[#D97706]' : 'bg-[#0D9488]'
              } animate-pulse`}
            />
          )}
        </span>
        {(timer.isRunning || !compact) && (
          <span
            className={`ltr-inline font-mono tabular-nums ${
              timer.isRunning ? 'inline' : 'hidden 2xl:inline'
            }`}
          >
            {formatClockDisplay(activeDisplaySeconds)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="تایمر مطالعه جادرسی"
          className="elevation-tier-3 absolute left-0 z-50 mt-2 w-[312px] max-w-[calc(100vw-24px)] rounded-2xl border border-[#E2E8F0] bg-white p-4 dark:border-[#364554] dark:bg-[#1C252E]"
        >
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2.5 dark:border-[#27323E]">
            <div className="flex items-center gap-1.5">
              <Timer className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
              <span className="text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                تایمر مطالعه
              </span>
            </div>
            <div className="flex items-center gap-1">
              {timer.mode === 'pomodoro' && (
                <button
                  type="button"
                  onClick={() => setShowSettings((v) => !v)}
                  title="تنظیم زمان تمرکز و استراحت"
                  aria-label="تنظیم زمان تمرکز و استراحت"
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    showSettings
                      ? 'bg-[#F0FDFA] text-[#0F766E] dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                      : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E]'
                  }`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن تایمر"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#161D24]">
            <button
              type="button"
              onClick={() => timer.setMode('stopwatch')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors ${
                timer.mode === 'stopwatch'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
              }`}
            >
              <Watch className="h-3.5 w-3.5" />
              <span>کرنومتر عادی</span>
            </button>
            <button
              type="button"
              onClick={() => timer.setMode('pomodoro')}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors ${
                timer.mode === 'pomodoro'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
              }`}
            >
              <Timer className="h-3.5 w-3.5" />
              <span>پومودورو</span>
            </button>
          </div>

          {/* Phase / Save Notice */}
          {timer.lastNotice && (
            <div className="mt-2.5 flex items-start justify-between gap-2 rounded-lg border border-[#0D9488]/30 bg-[#F0FDFA] px-2.5 py-2 text-[11px] font-medium leading-5 text-[#0F766E] dark:border-[#14B8A6]/35 dark:bg-[#0F2928] dark:text-[#2DD4BF]">
              <span className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{timer.lastNotice}</span>
              </span>
              <button
                type="button"
                onClick={timer.clearNotice}
                aria-label="بستن پیام"
                className="shrink-0 opacity-70 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Clock Readout */}
          <div className="mt-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9F6] px-4 py-4 text-center dark:border-[#27323E] dark:bg-[#161D24]">
            {timer.mode === 'pomodoro' && (
              <div className="mb-1.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold">
                {isBreakPhase ? (
                  <>
                    <Coffee className="h-3.5 w-3.5 text-[#D97706]" />
                    <span className="text-[#B45309] dark:text-[#FBBF24]">
                      استراحت ({timer.settings.breakMinutes} دقیقه)
                    </span>
                  </>
                ) : (
                  <>
                    <Timer className="h-3.5 w-3.5 text-[#0D9488]" />
                    <span className="text-[#0F766E] dark:text-[#2DD4BF]">
                      جلسه تمرکز ({timer.settings.focusMinutes} دقیقه)
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="ltr-inline font-mono text-3xl font-bold tracking-tight text-[#0F172A] tabular-nums dark:text-[#F8FAFC]">
              {formatClockDisplay(activeDisplaySeconds)}
            </div>

            {timer.mode === 'pomodoro' && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#27323E]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isBreakPhase ? 'bg-[#D97706]' : 'bg-[#0D9488]'
                  }`}
                  style={{ width: `${pomodoroProgress}%` }}
                />
              </div>
            )}

            {/* Playback Controls — RTL visual order: Next phase (right) → Start (center) → Reset (left) */}
            <div className="mt-3.5 flex items-center justify-center gap-2">
              {timer.mode === 'pomodoro' && (
                <HoverTooltip
                  label={isBreakPhase ? 'رفتن به تمرکز' : 'رفتن به استراحت'}
                  placement="top"
                  align="start"
                >
                  <button
                    type="button"
                    onClick={timer.skipPomodoroPhase}
                    aria-label={isBreakPhase ? 'رفتن به تمرکز' : 'رفتن به استراحت'}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#475569] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                </HoverTooltip>
              )}

              <button
                type="button"
                onClick={timer.toggleRunning}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${
                  timer.isRunning
                    ? 'bg-[#475569] hover:bg-[#334155]'
                    : isBreakPhase
                    ? 'bg-[#D97706] hover:bg-[#B45309]'
                    : 'bg-[#0D9488] hover:bg-[#0F766E]'
                }`}
              >
                {timer.isRunning ? (
                  <>
                    <span>توقف</span>
                    <Pause className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    <span>{hasElapsedPaused ? 'ادامه' : 'شروع'}</span>
                    <Play className="h-3.5 w-3.5 -scale-x-100" />
                  </>
                )}
              </button>

              <HoverTooltip label="بازنشانی" placement="top" align="end">
                <button
                  type="button"
                  onClick={timer.reset}
                  aria-label="بازنشانی تایمر"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#475569] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </HoverTooltip>
            </div>
          </div>

          {/* Customizable Pomodoro Settings */}
          {timer.mode === 'pomodoro' && showSettings && (
            <div className="mt-3 space-y-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs dark:border-[#27323E] dark:bg-[#161D24]">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]">
                    تمرکز (دقیقه)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={focusDraft}
                    onChange={(e) => setFocusDraft(e.target.value)}
                    onBlur={applyCustomSettings}
                    className="ltr-inline w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-center font-mono text-xs text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F8FAFC]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#475569] dark:text-[#94A3B8]">
                    استراحت (دقیقه)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={breakDraft}
                    onChange={(e) => setBreakDraft(e.target.value)}
                    onBlur={applyCustomSettings}
                    className="ltr-inline w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-center font-mono text-xs text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F8FAFC]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  {[
                    { f: 25, b: 5, label: '۲۵/۵' },
                    { f: 45, b: 10, label: '۴۵/۱۰' },
                    { f: 50, b: 10, label: '۵۰/۱۰' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        timer.updateSettings({ focusMinutes: preset.f, breakMinutes: preset.b })
                      }
                      className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        timer.settings.focusMinutes === preset.f &&
                        timer.settings.breakMinutes === preset.b
                          ? 'bg-[#0D9488] text-white'
                          : 'bg-white text-[#475569] hover:bg-[#E2E8F0] dark:bg-[#1C252E] dark:text-[#CBD5E1]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    applyCustomSettings();
                    setShowSettings(false);
                  }}
                  className="rounded-md bg-[#0F172A] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#1E293B] dark:bg-[#0D9488] dark:hover:bg-[#0F766E]"
                >
                  اعمال
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
