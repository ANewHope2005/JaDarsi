import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Clock,
  X,
  CornerDownLeft,
  FileUp,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Flashcard, FlashcardStatus, Lesson } from '../types/study';
import { FormulaDisplay, RichMathText } from '../utils/latexText';
import { FlashcardIcon } from './icons/FlashcardIcon';
import { HoverTooltip } from './ui/HoverTooltip';

interface FlashcardWorkspaceProps {
  lesson: Lesson;
  cards: Flashcard[];
  statusMap: Record<string, FlashcardStatus>;
  onUpdateStatus: (cardId: string, status: FlashcardStatus) => void;
  onResetLessonStatuses: (cardIds: string[]) => void;
  onAddCustomCard: (card: Omit<Flashcard, 'id' | 'isCustom'>) => void;
  onUpdateCard?: (cardId: string, updates: Partial<Flashcard>) => void;
  onDeleteCard?: (cardId: string) => void;
  onJumpToSection: (sectionId: string) => void;
  focusCardId?: string | null;
  onClearFocusCard?: () => void;
  onOpenImportModal?: () => void;
  onOpenResources?: () => void;
}

type DeckFilter = 'all' | 'review' | 'unseen' | 'mastered';

export const FlashcardWorkspace: React.FC<FlashcardWorkspaceProps> = ({
  lesson,
  cards,
  statusMap,
  onUpdateStatus,
  onResetLessonStatuses,
  onAddCustomCard,
  onUpdateCard,
  onDeleteCard,
  onJumpToSection,
  focusCardId,
  onClearFocusCard,
  onOpenImportModal,
  onOpenResources,
}) => {
  const [filter, setFilter] = useState<DeckFilter>('all');
  const [shuffled, setShuffled] = useState(false);
  const [orderSeed, setOrderSeed] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newFormula, setNewFormula] = useState('');
  const [newCategory, setNewCategory] = useState('یادداشت شخصی');

  // Single-card Edit & Delete state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editFrontFormula, setEditFrontFormula] = useState('');
  const [editBackFormula, setEditBackFormula] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);

  useEffect(() => {
    setOrderSeed(cards.map((c) => c.id));
    setCurrentIndex((prev) => (cards.length === 0 ? 0 : Math.min(prev, cards.length - 1)));
    setIsFlipped(false);
    setConfirmDeleteCardId(null);
  }, [lesson.id, cards.length]);

  // Direct jump to a specific flashcard from Global Search
  useEffect(() => {
    if (!focusCardId) return;
    const idx = cards.findIndex((c) => c.id === focusCardId);
    if (idx !== -1) {
      setFilter('all');
      setShuffled(false);
      setCurrentIndex(idx);
      setIsFlipped(false);
    }
    onClearFocusCard?.();
  }, [focusCardId, lesson.id, cards, onClearFocusCard]);

  const counts = useMemo(() => {
    let mastered = 0;
    let review = 0;
    let unseen = 0;
    for (const c of cards) {
      const s = statusMap[c.id] ?? 'unseen';
      if (s === 'mastered') mastered++;
      else if (s === 'review') review++;
      else unseen++;
    }
    return { total: cards.length, mastered, review, unseen };
  }, [cards, statusMap]);

  const orderedCards = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const base = shuffled
      ? orderSeed.map((id) => byId.get(id)).filter((c): c is Flashcard => Boolean(c))
      : cards;

    if (filter === 'all') return base;
    return base.filter((c) => (statusMap[c.id] ?? 'unseen') === filter);
  }, [cards, orderSeed, shuffled, filter, statusMap]);

  const safeIndex = orderedCards.length > 0 ? Math.min(currentIndex, orderedCards.length - 1) : 0;
  const activeCard = orderedCards[safeIndex];

  const shuffleDeck = useCallback(() => {
    const ids = [...cards.map((c) => c.id)];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setOrderSeed(ids);
    setShuffled(true);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [cards]);

  const handleToggleShuffle = () => {
    if (!shuffled) {
      shuffleDeck();
    } else {
      setShuffled(false);
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  };

  const goNext = useCallback(() => {
    if (orderedCards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % orderedCards.length);
  }, [orderedCards.length]);

  const goPrev = useCallback(() => {
    if (orderedCards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + orderedCards.length) % orderedCards.length);
  }, [orderedCards.length]);

  const markCard = useCallback(
    (status: FlashcardStatus) => {
      if (!activeCard) return;
      onUpdateStatus(activeCard.id, status);
      setIsFlipped(false);
      if (orderedCards.length > 1) {
        setCurrentIndex((prev) => (prev + 1 >= orderedCards.length ? 0 : prev + 1));
      }
    },
    [activeCard, onUpdateStatus, orderedCards.length]
  );

  // Keyboard shortcuts: Space to flip, 1 review, 2 mastered, arrows to navigate
  useEffect(() => {
    if (showAddForm || editingCardId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((v) => !v);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goPrev();
      } else if (e.key === '1') {
        markCard('review');
      } else if (e.key === '2') {
        markCard('mastered');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddForm, editingCardId, goNext, goPrev, markCard]);

  const handleCreateCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim()) return;
    onAddCustomCard({
      front: newFront.trim(),
      back: newBack.trim(),
      frontFormula: newFormula.trim() || undefined,
      category: newCategory.trim() || 'یادداشت شخصی',
    });
    setNewFront('');
    setNewBack('');
    setNewFormula('');
    setShowAddForm(false);
    setFilter('all');
  };

  const openEditCard = (card: Flashcard) => {
    setEditingCardId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditFrontFormula(card.frontFormula ?? '');
    setEditBackFormula(card.backFormula ?? '');
    setEditCategory(card.category);
    setConfirmDeleteCardId(null);
  };

  const handleSaveCardEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCardId || !onUpdateCard || !editFront.trim() || !editBack.trim()) return;
    onUpdateCard(editingCardId, {
      front: editFront.trim(),
      back: editBack.trim(),
      frontFormula: editFrontFormula.trim() || undefined,
      backFormula: editBackFormula.trim() || undefined,
      category: editCategory.trim() || 'یادداشت شخصی',
    });
    setEditingCardId(null);
  };

  const progressPercent = counts.total > 0 ? Math.round((counts.mastered / counts.total) * 100) : 0;
  const activeStatus = activeCard ? statusMap[activeCard.id] ?? 'unseen' : 'unseen';

  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 md:px-6 lg:py-10">
      {/* Auxiliary Top Control Header */}
      <div className="elevation-tier-1 rounded-2xl bg-white p-5 dark:bg-[#1C252E]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <span className="ltr-inline font-mono font-medium text-[#0F766E] dark:text-[#2DD4BF]">
                {lesson.code}
              </span>
              <span aria-hidden="true">·</span>
              <span>مرور هوشمند با تکرار فاصله‌دار</span>
            </div>
            <h1 className="mt-1 text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              دسته فلش‌کارت‌های {lesson.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <HoverTooltip
              label={shuffled ? 'ترتیب تصادفی فعال (کلیک برای ترتیب اصلی)' : 'بر زدن کارت‌ها'}
              placement="bottom"
              align="center"
            >
              <button
                type="button"
                onClick={handleToggleShuffle}
                aria-pressed={shuffled}
                aria-label={shuffled ? 'بازگشت به ترتیب اصلی کارت‌ها' : 'بر زدن کارت‌ها'}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  shuffled
                    ? 'border-[#0D9488]/45 bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6]/45 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                    : 'border-[#CBD5E1] bg-white text-[#475569] hover:border-[#94A3B8] hover:text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]'
                }`}
              >
                <Shuffle className="h-4 w-4 -scale-x-100" />
              </button>
            </HoverTooltip>

            {shuffled && cards.length > 1 && (
              <HoverTooltip label="بر زدن مجدد کارت‌ها" placement="bottom" align="center">
                <button
                  type="button"
                  onClick={shuffleDeck}
                  aria-label="بر زدن مجدد کارت‌ها"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#0F766E] transition-colors hover:border-[#0D9488] hover:bg-[#F0FDFA] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF] dark:hover:bg-[#0F2928]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </HoverTooltip>
            )}

            <HoverTooltip label="شروع مجدد مرور" placement="bottom" align="center">
              <button
                type="button"
                onClick={() => onResetLessonStatuses(cards.map((c) => c.id))}
                aria-label="شروع مجدد مرور"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#475569] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </HoverTooltip>

            <HoverTooltip label="افزودن کارت جدید" placement="bottom" align="end">
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                aria-label="افزودن کارت جدید"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0D9488] text-white transition-colors hover:bg-[#0F766E]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </HoverTooltip>
          </div>
        </div>

        {/* Progress Bar (h-1.5, fill #0D9488) & Remaining Tally */}
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3 text-[#475569] tabular-nums dark:text-[#CBD5E1]">
              <span>
                تسلط یافته:{' '}
                <strong className="font-semibold text-[#059669] dark:text-[#34D399]">
                  {counts.mastered}
                </strong>{' '}
                از {counts.total}
              </span>
              <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
              <span>
                نیاز به مرور:{' '}
                <strong className="font-semibold text-[#D97706] dark:text-[#FBBF24]">
                  {counts.review}
                </strong>
              </span>
              <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
              <span>
                باقی‌مانده:{' '}
                <strong className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {counts.total - counts.mastered}
                </strong>
              </span>
            </div>
            <span className="font-mono text-xs font-semibold text-[#0D9488] tabular-nums dark:text-[#2DD4BF]">
              {progressPercent}%
            </span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0] dark:bg-[#27323E]">
            <div
              className="h-full rounded-full bg-[#0D9488] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Filter Segmented Strip */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `همه (${counts.total})` },
              { id: 'review', label: `نیاز به مرور (${counts.review})` },
              { id: 'unseen', label: `مرورنشده (${counts.unseen})` },
              { id: 'mastered', label: `بلدم (${counts.mastered})` },
            ] as { id: DeckFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setFilter(tab.id);
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums transition-colors ${
                filter === tab.id
                  ? 'bg-[#0F172A] text-white dark:bg-[#0D9488]'
                  : 'bg-[#F4F5F7] text-[#475569] hover:bg-[#E2E8F0] dark:bg-[#161D24] dark:text-[#94A3B8] dark:hover:bg-[#27323E]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add Custom Flashcard Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateCard}
          className="elevation-tier-2 mt-5 rounded-2xl bg-white p-5 dark:bg-[#1C252E]"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              افزودن فلش‌کارت جدید به این فصل
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg p-1 text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                روی کارت (پرسش یا عنوان مفهوم)
              </label>
              <input
                type="text"
                required
                value={newFront}
                onChange={(e) => setNewFront(e.target.value)}
                placeholder="مثلاً: شرط خودبه‌خودی بودن واکنش در دما و فشار ثابت چیست؟"
                className="archival-input w-full border border-[#CBD5E1] bg-white text-sm text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                فرمول اختیاری (چپ‌چین LTR)
              </label>
              <input
                type="text"
                dir="ltr"
                value={newFormula}
                onChange={(e) => setNewFormula(e.target.value)}
                placeholder="ΔG = ΔH - TΔS < 0"
                className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-sm text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                پشت کارت (پاسخ تشریحی)
              </label>
              <textarea
                required
                rows={3}
                value={newBack}
                onChange={(e) => setNewBack(e.target.value)}
                placeholder="توضیح دقیق و خلاصه پاسخ..."
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none focus:ring-3 focus:ring-[#0D9488]/15 dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="دسته‌بندی"
                className="archival-input w-44 border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1]"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
                >
                  ذخیره فلش‌کارت
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Edit Individual Flashcard Form */}
      {editingCardId && onUpdateCard && (
        <form
          onSubmit={handleSaveCardEdit}
          className="elevation-tier-2 mt-5 rounded-2xl border border-[#0D9488]/40 bg-white p-5 dark:border-[#14B8A6]/40 dark:bg-[#1C252E]"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
              ویرایش فلش‌کارت انتخاب‌شده
            </h2>
            <button
              type="button"
              onClick={() => setEditingCardId(null)}
              aria-label="بستن ویرایش"
              className="rounded-lg p-1 text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                روی کارت (پرسش یا عنوان مفهوم)
              </label>
              <textarea
                required
                rows={2}
                value={editFront}
                onChange={(e) => setEditFront(e.target.value)}
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-sm leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  فرمول روی کارت (اختیاری)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editFrontFormula}
                  onChange={(e) => setEditFrontFormula(e.target.value)}
                  className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  فرمول پشت کارت (اختیاری)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editBackFormula}
                  onChange={(e) => setEditBackFormula(e.target.value)}
                  className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                پشت کارت (پاسخ تشریحی)
              </label>
              <textarea
                required
                rows={3}
                value={editBack}
                onChange={(e) => setEditBack(e.target.value)}
                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="دسته‌بندی"
                className="archival-input w-44 border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCardId(null)}
                  className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1]"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Centerpiece Tactile Index Card Study Deck */}
      {activeCard ? (
        <div className="mt-6">
          <div className="perspective-1200">
            <div
              onClick={() => setIsFlipped((v) => !v)}
              role="button"
              tabIndex={0}
              aria-label={isFlipped ? 'نمایش روی کارت' : 'برگرداندن کارت برای مشاهده پاسخ'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setIsFlipped((v) => !v);
                }
              }}
              className={`preserve-3d relative min-h-[380px] w-full cursor-pointer transition-transform duration-500 ease-out ${
                isFlipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* Front Face (Question) */}
              <div className="backface-hidden elevation-tier-3 absolute inset-0 flex flex-col justify-between rounded-3xl bg-[#FAF9F6] p-7 dark:bg-[#161D24] sm:p-9">
                <div className="flex items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">پرسش</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeCard.category}</span>
                    {activeStatus === 'mastered' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-[#059669] dark:text-[#34D399]">بلدم</span>
                      </>
                    )}
                    {activeStatus === 'review' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-[#D97706] dark:text-[#FBBF24]">
                          نیاز به مرور
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onUpdateCard && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditCard(activeCard);
                        }}
                        title="ویرایش این فلش‌کارت"
                        aria-label="ویرایش این فلش‌کارت"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-white hover:text-[#0F766E] dark:text-[#94A3B8] dark:hover:bg-[#1C252E] dark:hover:text-[#2DD4BF]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteCard && confirmDeleteCardId !== activeCard.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteCardId(activeCard.id);
                        }}
                        title="حذف این فلش‌کارت"
                        aria-label="حذف این فلش‌کارت"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:text-[#94A3B8] dark:hover:bg-[#7F1D1D]/30 dark:hover:text-[#F87171]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteCard && confirmDeleteCardId === activeCard.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2 py-0.5 text-[11px] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/35"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCard(activeCard.id);
                            setConfirmDeleteCardId(null);
                          }}
                          className="font-semibold text-[#DC2626] hover:underline dark:text-[#FCA5A5]"
                        >
                          حذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCardId(null)}
                          className="text-[#64748B] hover:text-[#0F172A] dark:text-[#CBD5E1]"
                        >
                          لغو
                        </button>
                      </div>
                    )}
                    <span className="mr-1 font-mono tabular-nums">
                      {safeIndex + 1} / {orderedCards.length}
                    </span>
                  </div>
                </div>

                <div className="my-auto flex flex-col items-center justify-center py-8 text-center">
                  <h2 className="max-w-[580px] text-xl font-semibold leading-[1.85] text-[#0F172A] dark:text-[#F8FAFC] sm:text-2xl">
                    <RichMathText text={activeCard.front} />
                  </h2>
                  {activeCard.frontFormula && (
                    <div className="mt-5 rounded-xl border border-[#0D9488]/25 bg-[#F0FDFA] px-5 py-3 text-sm font-medium text-[#0F172A] dark:border-[#14B8A6]/30 dark:bg-[#0F2928] dark:text-[#F1F5F9]">
                      <FormulaDisplay formula={activeCard.frontFormula} />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4 text-xs text-[#64748B] dark:border-[#27323E] dark:text-[#94A3B8]">
                  <span className="flex items-center gap-1.5">
                    <CornerDownLeft className="h-3.5 w-3.5 text-[#0D9488]" />
                    <span>برای دیدن پاسخ روی کارت کلیک کنید</span>
                  </span>
                  <kbd className="ltr-inline hidden rounded bg-[#E2E8F0]/80 px-2 py-0.5 font-mono text-[11px] text-[#334155] dark:bg-[#27323E] dark:text-[#CBD5E1] sm:inline">
                    Space
                  </kbd>
                </div>
              </div>

              {/* Back Face (Answer) */}
              <div className="backface-hidden rotate-y-180 elevation-tier-3 absolute inset-0 flex flex-col justify-between rounded-3xl bg-[#FFFFFF] p-7 dark:bg-[#1C252E] sm:p-9">
                <div className="flex items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#059669] dark:text-[#34D399]">پاسخ تشریحی</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeCard.category}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onUpdateCard && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditCard(activeCard);
                        }}
                        title="ویرایش این فلش‌کارت"
                        aria-label="ویرایش این فلش‌کارت"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F766E] dark:text-[#94A3B8] dark:hover:bg-[#27323E] dark:hover:text-[#2DD4BF]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteCard && confirmDeleteCardId !== activeCard.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteCardId(activeCard.id);
                        }}
                        title="حذف این فلش‌کارت"
                        aria-label="حذف این فلش‌کارت"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:text-[#94A3B8] dark:hover:bg-[#7F1D1D]/30 dark:hover:text-[#F87171]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteCard && confirmDeleteCardId === activeCard.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2 py-0.5 text-[11px] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/35"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCard(activeCard.id);
                            setConfirmDeleteCardId(null);
                          }}
                          className="font-semibold text-[#DC2626] hover:underline dark:text-[#FCA5A5]"
                        >
                          حذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCardId(null)}
                          className="text-[#64748B] hover:text-[#0F172A] dark:text-[#CBD5E1]"
                        >
                          لغو
                        </button>
                      </div>
                    )}
                    <span className="mr-1 font-mono tabular-nums">
                      {safeIndex + 1} / {orderedCards.length}
                    </span>
                  </div>
                </div>

                <div className="my-auto flex flex-col items-center justify-center py-6 text-center">
                  <div className="max-w-[600px] text-base leading-[2.0] text-[#1E293B] dark:text-[#E2E8F0] sm:text-lg">
                    <RichMathText text={activeCard.back} />
                  </div>
                  {activeCard.backFormula && (
                    <div className="mt-5 rounded-xl border border-[#0D9488]/25 bg-[#F0FDFA] px-5 py-3 text-sm font-medium text-[#0F172A] dark:border-[#14B8A6]/30 dark:bg-[#0F2928] dark:text-[#F1F5F9]">
                      <FormulaDisplay formula={activeCard.backFormula} />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4 text-xs text-[#64748B] dark:border-[#27323E] dark:text-[#94A3B8]">
                  <span>کلیک برای بازگشت به صورت پرسش</span>
                  {activeCard.sectionId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToSection(activeCard.sectionId!);
                      }}
                      className="flex items-center gap-1 font-medium text-[#0D9488] hover:underline dark:text-[#2DD4BF]"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>بخش مرتبط در جزوه</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pinned Bottom Review Action Bar (Icon-Only with Hover Tooltips) */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HoverTooltip label="قبلی" placement="top" align="start">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="قبلی"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]"
                >
                  <ChevronRight className="h-4.5 w-4.5" />
                </button>
              </HoverTooltip>
              <HoverTooltip label="بعدی" placement="top" align="center">
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="بعدی"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:border-[#94A3B8] hover:text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]"
                >
                  <ChevronLeft className="h-4.5 w-4.5" />
                </button>
              </HoverTooltip>
            </div>

            <div className="flex items-center gap-2.5">
              <HoverTooltip label="نیاز به مرور" placement="top" align="center">
                <button
                  type="button"
                  onClick={() => markCard('review')}
                  aria-label="نیاز به مرور"
                  className="flex h-11 w-14 items-center justify-center rounded-xl border border-[#FCD34D] bg-[#FFFBEB] text-[#B45309] transition-all duration-150 hover:bg-[#FEF3C7] dark:border-[#B45309]/60 dark:bg-[#451A03]/40 dark:text-[#FBBF24] dark:hover:bg-[#451A03]/60 sm:w-16"
                >
                  <Clock className="h-4.5 w-4.5 shrink-0" />
                </button>
              </HoverTooltip>

              <HoverTooltip label="بلدم" placement="top" align="end">
                <button
                  type="button"
                  onClick={() => markCard('mastered')}
                  aria-label="بلدم"
                  className="flex h-11 w-14 items-center justify-center rounded-xl border border-[#6EE7B7] bg-[#ECFDF5] text-[#047857] transition-all duration-150 hover:bg-[#D1FAE5] dark:border-[#047857]/60 dark:bg-[#064E3B]/40 dark:text-[#34D399] dark:hover:bg-[#064E3B]/60 sm:w-16"
                >
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
                </button>
              </HoverTooltip>
            </div>
          </div>
        </div>
      ) : counts.total === 0 ? (
        <div className="elevation-tier-1 mt-6 rounded-2xl bg-[#FAF9F6] px-6 py-14 text-center dark:bg-[#161D24]">
          <FlashcardIcon className="mx-auto h-10 w-10 text-[#94A3B8]" />
          <h2 className="mt-3 text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            هنوز فلش‌کارتی برای «{lesson.title}» ثبت نشده است
          </h2>
          <p className="mt-1.5 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
            می‌توانید فایل CSV فلش‌کارت‌ها را وارد کنید یا اولین کارت مرور را به صورت دستی بسازید.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>ورود فایل فلش‌کارت (.csv)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-semibold text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>ساخت کارت جدید</span>
            </button>
            {onOpenResources && (
              <button
                type="button"
                onClick={onOpenResources}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-medium text-[#475569] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF]"
              >
                <span>مدیریت منابع</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="elevation-tier-1 mt-6 rounded-2xl bg-[#FAF9F6] px-6 py-16 text-center dark:bg-[#161D24]">
          <CheckCircle2 className="mx-auto h-10 w-10 text-[#059669]" />
          <h2 className="mt-3 text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            کارتی در این فیلتر باقی نمانده است
          </h2>
          <p className="mt-1.5 text-sm text-[#64748B] dark:text-[#94A3B8]">
            می‌توانید همه کارت‌های فصل را مرور کنید یا یک کارت جدید بسازید.
          </p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-5 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
          >
            نمایش همه کارت‌ها
          </button>
        </div>
      )}
    </div>
  );
};
