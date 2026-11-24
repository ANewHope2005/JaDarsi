import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  BookOpen,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileUp,
  FolderCog,
  FolderOpen,
  GripVertical,
  Network,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  Course,
  Flashcard,
  Lesson,
  MindmapNode,
  ResourceKind,
  WorkspaceMode,
} from '../types/study';
import { FlashcardIcon } from './icons/FlashcardIcon';
import {
  ParsedMarkdownLesson,
  ParsedMindmapImport,
  ParsedQuizImport,
  parseFlashcardsCsv,
  parseMarkdownLesson,
  parseMindmapJson,
  parseQuizJson,
} from '../utils/importers';

export interface CreateCourseInput {
  name: string;
  code?: string;
}

export interface CreateLessonInput {
  title: string;
  course: string;
  courseId?: string;
  createNewCourse?: boolean;
  code: string;
}

export interface RenameLessonInput {
  title: string;
  course: string;
  courseId?: string;
  code: string;
}

export interface ReplaceResourcePayload {
  kind: ResourceKind;
  fileName?: string;
  markdown?: ParsedMarkdownLesson;
  mindmap?: ParsedMindmapImport;
  flashcards?: Flashcard[];
  quiz?: ParsedQuizImport;
  append?: boolean;
}

interface ResourceManagerWorkspaceProps {
  courses: Course[];
  lessons: Lesson[];
  activeLessonId: string | null;
  customCardsByLesson: Record<string, Flashcard[]>;
  onSelectLesson: (lessonId: string) => void;
  onOpenLessonInMode: (lessonId: string, mode: WorkspaceMode) => void;
  onOpenBatchImport: () => void;
  onCreateCourse: (input: CreateCourseInput) => string;
  onRenameCourse: (courseId: string, input: CreateCourseInput) => void;
  onDeleteCourse: (courseId: string) => void;
  onReorderCourses: (dragCourseId: string, targetCourseId: string) => void;
  onCreateLesson: (input: CreateLessonInput) => string;
  onRenameLesson: (lessonId: string, input: RenameLessonInput) => void;
  onDeleteLesson: (lessonId: string) => void;
  onReorderLessons: (dragLessonId: string, targetLessonId: string | null, targetCourseId?: string) => void;
  onReplaceResource: (lessonId: string, payload: ReplaceResourcePayload) => void;
  onRenameResource: (lessonId: string, kind: ResourceKind, newLabel: string) => void;
  onRenameSection: (lessonId: string, sectionId: string, newTitle: string) => void;
  onMoveResource: (
    fromLessonId: string,
    toLessonId: string,
    kind: ResourceKind,
    strategy: 'replace' | 'append'
  ) => void;
  onDeleteResource: (lessonId: string, kind: ResourceKind) => void;
}

function countTreeNodes(node: MindmapNode): number {
  return 1 + (node.children?.reduce((sum, c) => sum + countTreeNodes(c), 0) ?? 0);
}

export function isMindmapEmpty(node: MindmapNode | undefined): boolean {
  if (!node) return true;
  if (node.id.startsWith('empty-mm-')) return true;
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const hasRichContent = Boolean(
    node.formula ||
      (node.formulas && node.formulas.length > 0) ||
      (node.rules && node.rules.length > 0) ||
      (node.examples && node.examples.length > 0) ||
      (node.tables && node.tables.length > 0)
  );
  return (
    !hasChildren &&
    !hasRichContent &&
    (node.subtitle === 'بدون مایندمپ' || node.subtitle === 'بدون درخت دانش')
  );
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').trim();
}

export const ResourceManagerWorkspace: React.FC<ResourceManagerWorkspaceProps> = ({
  courses,
  lessons,
  activeLessonId,
  customCardsByLesson,
  onSelectLesson,
  onOpenLessonInMode,
  onOpenBatchImport,
  onCreateCourse,
  onRenameCourse,
  onDeleteCourse,
  onReorderCourses,
  onCreateLesson,
  onRenameLesson,
  onDeleteLesson,
  onReorderLessons,
  onReplaceResource,
  onRenameResource,
  onRenameSection,
  onMoveResource,
  onDeleteResource,
}) => {
  const [selectedId, setSelectedId] = useState<string>(activeLessonId ?? '');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [lessonSearch, setLessonSearch] = useState('');

  // Create Course form (top-level subject)
  const [showCreateCourseForm, setShowCreateCourseForm] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');

  // Course inline edit / delete / collapse
  const [collapsedCourses, setCollapsedCourses] = useState<Set<string>>(() => new Set());
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourseName, setEditCourseName] = useState('');
  const [editCourseCode, setEditCourseCode] = useState('');
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState<Course | null>(null);

  // Create Session/Lecture form (child of Course)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCourseId, setNewCourseId] = useState<string>(courses[0]?.id ?? '');
  const [newCourse, setNewCourse] = useState('');
  const [newCode, setNewCode] = useState('');

  // Rename session inline state
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editLessonTitle, setEditLessonTitle] = useState('');
  const [editLessonCourseId, setEditLessonCourseId] = useState('');
  const [editLessonCourse, setEditLessonCourse] = useState('');
  const [editLessonCode, setEditLessonCode] = useState('');

  // Drag & Drop state for courses and same-course sessions
  const [dragState, setDragState] = useState<
    { type: 'course'; id: string } | { type: 'lesson'; id: string; courseId: string } | null
  >(null);
  const [dropTarget, setDropTarget] = useState<
    { type: 'course'; id: string } | { type: 'lesson'; id: string } | null
  >(null);

  // Delete lesson confirmation modal
  const [confirmDeleteLesson, setConfirmDeleteLesson] = useState<Lesson | null>(null);

  // Per-resource inline states
  const [renamingKind, setRenamingKind] = useState<ResourceKind | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [movingKind, setMovingKind] = useState<ResourceKind | null>(null);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [moveStrategy, setMoveStrategy] = useState<'replace' | 'append'>('replace');
  const [confirmDeleteKind, setConfirmDeleteKind] = useState<ResourceKind | null>(null);
  const [draggingKind, setDraggingKind] = useState<ResourceKind | null>(null);

  // Expandable lecture sections rename list
  const [sectionsExpanded, setSectionsExpanded] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionTitleDraft, setSectionTitleDraft] = useState('');

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const lectureInputRef = useRef<HTMLInputElement>(null);
  const mindmapInputRef = useRef<HTMLInputElement>(null);
  const flashcardsInputRef = useRef<HTMLInputElement>(null);
  const quizInputRef = useRef<HTMLInputElement>(null);

  // Keep selectedId valid when lessons list changes (unless user explicitly focused an empty Course)
  useEffect(() => {
    if (selectedId && !lessons.some((l) => l.id === selectedId)) {
      setSelectedId(selectedCourseId ? '' : lessons[0]?.id ?? '');
    } else if (!selectedId && !selectedCourseId && lessons.length > 0) {
      setSelectedId(lessons[0].id);
    }
  }, [lessons, selectedId, selectedCourseId]);

  useEffect(() => {
    if (selectedCourseId && !courses.some((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [courses, selectedCourseId]);

  useEffect(() => {
    if (newCourseId === '__new__') return;
    if (courses.length > 0 && (!newCourseId || !courses.some((c) => c.id === newCourseId))) {
      setNewCourseId(courses[0].id);
    }
  }, [courses, newCourseId]);

  // Clear transient per-resource actions when switching selected lesson
  useEffect(() => {
    setRenamingKind(null);
    setMovingKind(null);
    setConfirmDeleteKind(null);
    setSectionsExpanded(false);
    setEditingSectionId(null);
  }, [selectedId]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
  };

  const selectedLesson = useMemo(() => {
    if (selectedId) {
      return lessons.find((l) => l.id === selectedId) ?? null;
    }
    if (selectedCourseId) return null;
    return lessons[0] ?? null;
  }, [lessons, selectedId, selectedCourseId]);

  const selectedCourse = useMemo(
    () => (selectedCourseId ? courses.find((c) => c.id === selectedCourseId) ?? null : null),
    [courses, selectedCourseId]
  );

  const selectedCourseSessionCount = useMemo(() => {
    if (!selectedLesson) return 0;
    return lessons.filter((l) =>
      selectedLesson.courseId
        ? l.courseId === selectedLesson.courseId
        : l.course === selectedLesson.course
    ).length;
  }, [lessons, selectedLesson]);

  const filteredLessons = useMemo(() => {
    const q = lessonSearch.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.course.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [lessons, lessonSearch]);

  const groupedCourses = useMemo(() => {
    const q = lessonSearch.trim().toLowerCase();
    const groups = courses
      .map((course) => {
        const courseMatches =
          !q ||
          course.name.toLowerCase().includes(q) ||
          (course.code?.toLowerCase().includes(q) ?? false);
        const childLessons = lessons.filter(
          (l) => (l.courseId ? l.courseId === course.id : l.course === course.name)
        );
        const visibleLessons = q
          ? courseMatches
            ? childLessons
            : childLessons.filter(
                (l) =>
                  l.title.toLowerCase().includes(q) ||
                  l.code.toLowerCase().includes(q)
              )
          : childLessons;
        return { course, lessons: visibleLessons, totalLessons: childLessons.length, visible: courseMatches || visibleLessons.length > 0 };
      })
      .filter((g) => g.visible);

    const assignedIds = new Set(groups.flatMap((g) => g.lessons.map((l) => l.id)));
    const orphanLessons = filteredLessons.filter((l) => !assignedIds.has(l.id));
    return { groups, orphanLessons };
  }, [courses, lessons, filteredLessons, lessonSearch]);

  const otherLessons = useMemo(
    () => lessons.filter((l) => l.id !== selectedLesson?.id),
    [lessons, selectedLesson?.id]
  );

  const aggregateStats = useMemo(() => {
    let sections = 0;
    let cards = 0;
    let questions = 0;
    for (const l of lessons) {
      sections += l.sections.length;
      cards += l.flashcards.length + (customCardsByLesson[l.id]?.length ?? 0);
      questions += l.quiz.length;
    }
    return { sections, cards, questions };
  }, [lessons, customCardsByLesson]);

  const getLessonResourceCount = (lesson: Lesson): number => {
    let count = 0;
    if (lesson.sections.length > 0) count++;
    if (!isMindmapEmpty(lesson.mindmap)) count++;
    if (lesson.flashcards.length + (customCardsByLesson[lesson.id]?.length ?? 0) > 0) count++;
    if (lesson.quiz.length > 0) count++;
    return count;
  };

  const handleCreateCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCourseName.trim();
    if (!trimmed) {
      showNotice('error', 'لطفاً نام درس را وارد کنید.');
      return;
    }
    const createdCourseId = onCreateCourse({
      name: trimmed,
      code: newCourseCode.trim() || undefined,
    });
    setNewCourseId(createdCourseId);
    setSelectedCourseId(createdCourseId);
    setSelectedId('');
    setNewCourseName('');
    setNewCourseCode('');
    setShowCreateCourseForm(false);
    showNotice('success', `درس «${trimmed}» ایجاد شد. اکنون می‌توانید جلسات آن را اضافه کنید.`);
  };

  const startEditingCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setEditCourseName(course.name);
    setEditCourseCode(course.code ?? '');
  };

  const handleSaveCourseRename = (e: React.FormEvent, courseId: string) => {
    e.preventDefault();
    const trimmed = editCourseName.trim();
    if (!trimmed) {
      showNotice('error', 'نام درس نمی‌تواند خالی باشد.');
      return;
    }
    onRenameCourse(courseId, {
      name: trimmed,
      code: editCourseCode.trim() || undefined,
    });
    setEditingCourseId(null);
    showNotice('success', `نام درس به «${trimmed}» تغییر یافت.`);
  };

  const handleConfirmDeleteCourse = () => {
    if (!confirmDeleteCourse) return;
    const deletedName = confirmDeleteCourse.name;
    onDeleteCourse(confirmDeleteCourse.id);
    setConfirmDeleteCourse(null);
    showNotice('success', `درس «${deletedName}» و جلسات زیرمجموعه آن حذف شد.`);
  };

  const openNewSessionForCourse = (courseId?: string) => {
    setShowCreateCourseForm(false);
    if (courseId) {
      setNewCourseId(courseId);
    } else if (courses.length > 0 && !newCourseId) {
      setNewCourseId(courses[0].id);
    }
    setShowCreateForm(true);
  };

  const handleCreateLessonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) {
      showNotice('error', 'لطفاً عنوان جلسه جدید را وارد کنید.');
      return;
    }
    const creatingNewCourse = courses.length === 0 || newCourseId === '__new__';
    if (creatingNewCourse && !newCourse.trim()) {
      showNotice('error', 'لطفاً نام درس جدید را وارد کنید.');
      return;
    }
    const parentCourse = creatingNewCourse
      ? undefined
      : courses.find((c) => c.id === newCourseId);
    const resolvedCourseName = parentCourse?.name || newCourse.trim() || 'درس جدید';
    const courseSessionCount = parentCourse
      ? lessons.filter((l) => l.courseId === parentCourse.id).length
      : 0;
    const createdId = onCreateLesson({
      title: trimmed,
      course: resolvedCourseName,
      courseId: parentCourse?.id,
      createNewCourse: creatingNewCourse,
      code: newCode.trim() || `S-${101 + courseSessionCount}`,
    });
    setSelectedCourseId(null);
    setSelectedId(createdId);
    onSelectLesson(createdId);
    setNewTitle('');
    setNewCourse('');
    setNewCode('');
    setShowCreateForm(false);
    showNotice('success', `جلسه «${trimmed}» در درس «${resolvedCourseName}» ایجاد شد.`);
  };

  const startEditingLesson = (lesson: Lesson) => {
    setEditingLessonId(lesson.id);
    setEditLessonTitle(lesson.title);
    setEditLessonCourseId(
      lesson.courseId ?? courses.find((c) => c.name === lesson.course)?.id ?? ''
    );
    setEditLessonCourse(lesson.course);
    setEditLessonCode(lesson.code);
  };

  const handleSaveLessonRename = (e: React.FormEvent, lessonId: string) => {
    e.preventDefault();
    const trimmed = editLessonTitle.trim();
    if (!trimmed) {
      showNotice('error', 'عنوان جلسه نمی‌تواند خالی باشد.');
      return;
    }
    const matchedCourse = courses.find((c) => c.id === editLessonCourseId);
    onRenameLesson(lessonId, {
      title: trimmed,
      courseId: matchedCourse?.id,
      course: matchedCourse?.name || editLessonCourse.trim() || 'عمومی',
      code: editLessonCode.trim() || 'S-100',
    });
    setEditingLessonId(null);
    showNotice('success', `مشخصات جلسه به «${trimmed}» به‌روزرسانی شد.`);
  };

  const handleConfirmDeleteLesson = () => {
    if (!confirmDeleteLesson) return;
    const deletedTitle = confirmDeleteLesson.title;
    onDeleteLesson(confirmDeleteLesson.id);
    setConfirmDeleteLesson(null);
    showNotice('success', `جلسه «${deletedTitle}» و منابع مرتبط با آن حذف شد.`);
  };

  const toggleCourseCollapsed = (courseId: string) => {
    setCollapsedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const handleResourceFile = async (kind: ResourceKind, file: File | undefined) => {
    if (!file || !selectedLesson) return;
    try {
      const text = await file.text();
      const cleanFileName = stripExtension(file.name);

      if (kind === 'lecture') {
        const parsed = parseMarkdownLesson(text, selectedLesson.chapterNumber);
        onReplaceResource(selectedLesson.id, {
          kind: 'lecture',
          fileName: parsed.title || cleanFileName,
          markdown: parsed,
        });
        showNotice(
          'success',
          `جزوه «${file.name}» (${parsed.sections.length} بخش) برای جلسه «${selectedLesson.title}» ذخیره شد.`
        );
        return;
      }

      if (kind === 'mindmap') {
        const parsed = parseMindmapJson(text);
        onReplaceResource(selectedLesson.id, {
          kind: 'mindmap',
          fileName: parsed.title || cleanFileName,
          mindmap: parsed,
        });
        showNotice(
          'success',
          `مایندمپ «${file.name}» (${parsed.nodeCount} گره) برای جلسه «${selectedLesson.title}» ذخیره شد.`
        );
        return;
      }

      if (kind === 'flashcards') {
        const parsed = parseFlashcardsCsv(text, selectedLesson.id);
        onReplaceResource(selectedLesson.id, {
          kind: 'flashcards',
          fileName: cleanFileName,
          flashcards: parsed,
        });
        showNotice(
          'success',
          `${parsed.length} فلش‌کارت از «${file.name}» برای جلسه «${selectedLesson.title}» ذخیره شد.`
        );
        return;
      }

      if (kind === 'quiz') {
        const parsed = parseQuizJson(text);
        onReplaceResource(selectedLesson.id, {
          kind: 'quiz',
          fileName: parsed.title || cleanFileName,
          quiz: parsed,
        });
        showNotice(
          'success',
          `آزمون «${file.name}» (${parsed.questions.length} سوال) برای جلسه «${selectedLesson.title}» ذخیره شد.`
        );
      }
    } catch (err) {
      showNotice(
        'error',
        err instanceof Error ? err.message : 'خطا در پردازش فایل انتخاب‌شده.'
      );
    }
  };

  const startMoveResource = (kind: ResourceKind) => {
    setRenamingKind(null);
    setConfirmDeleteKind(null);
    setMovingKind(kind);
    setMoveTargetId(otherLessons[0]?.id ?? '');
    setMoveStrategy('replace');
  };

  const handleConfirmMove = (kind: ResourceKind) => {
    if (!selectedLesson || !moveTargetId) return;
    const targetLesson = lessons.find((l) => l.id === moveTargetId);
    if (!targetLesson) return;

    const kindNames: Record<ResourceKind, string> = {
      lecture: 'جزوه درسی',
      mindmap: 'مایندمپ',
      flashcards: 'فلش‌کارت‌ها',
      quiz: 'آزمون تستی',
    };

    onMoveResource(selectedLesson.id, targetLesson.id, kind, moveStrategy);
    setMovingKind(null);
    showNotice(
      'success',
      `${kindNames[kind]} با موفقیت به جلسه «${targetLesson.title}» (درس ${targetLesson.course}) منتقل شد.`
    );
  };

  const handleConfirmDeleteResource = (kind: ResourceKind) => {
    if (!selectedLesson) return;
    const kindNames: Record<ResourceKind, string> = {
      lecture: 'جزوه درسی',
      mindmap: 'مایندمپ',
      flashcards: 'فلش‌کارت‌ها',
      quiz: 'آزمون تستی',
    };
    onDeleteResource(selectedLesson.id, kind);
    setConfirmDeleteKind(null);
    showNotice('success', `${kindNames[kind]} از جلسه «${selectedLesson.title}» حذف شد.`);
  };

  const selectedCustomCards = selectedLesson ? customCardsByLesson[selectedLesson.id] ?? [] : [];
  const totalLessonFlashcards = selectedLesson
    ? selectedLesson.flashcards.length + selectedCustomCards.length
    : 0;
  const hasLecture = selectedLesson ? selectedLesson.sections.length > 0 : false;
  const hasMindmap = selectedLesson ? !isMindmapEmpty(selectedLesson.mindmap) : false;
  const hasFlashcards = totalLessonFlashcards > 0;
  const hasQuiz = selectedLesson ? selectedLesson.quiz.length > 0 : false;
  const multiQuizCount = selectedLesson
    ? selectedLesson.quiz.filter((q) => q.type === 'multi').length
    : 0;

  const resourceItems: {
    kind: ResourceKind;
    title: string;
    format: string;
    accept: string;
    modeTarget: WorkspaceMode;
    modeLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    present: boolean;
    displayName: string;
    metaText: string;
    supportsAppendOnMove: boolean;
  }[] = selectedLesson
    ? [
        {
          kind: 'lecture',
          title: 'جزوه درسی',
          format: '.md',
          accept: '.md,.markdown,.txt',
          modeTarget: 'notes',
          modeLabel: 'مشاهده در جزوه',
          icon: BookOpen,
          inputRef: lectureInputRef,
          present: hasLecture,
          displayName: selectedLesson.resourceLabels?.lecture || `جزوه ${selectedLesson.title}`,
          metaText: hasLecture
            ? `${selectedLesson.sections.length} بخش · ${selectedLesson.readingMinutes} دقیقه مطالعه`
            : 'فایل جزوه ثبت نشده است',
          supportsAppendOnMove: false,
        },
        {
          kind: 'mindmap',
          title: 'مایندمپ',
          format: '.json',
          accept: '.json',
          modeTarget: 'mindmap',
          modeLabel: 'مشاهده در مایندمپ',
          icon: Network,
          inputRef: mindmapInputRef,
          present: hasMindmap,
          displayName:
            selectedLesson.resourceLabels?.mindmap ||
            (hasMindmap ? selectedLesson.mindmap.title : `مایندمپ ${selectedLesson.title}`),
          metaText: hasMindmap
            ? `${countTreeNodes(selectedLesson.mindmap)} گره مفهومی`
            : 'فایل مایندمپ ثبت نشده است',
          supportsAppendOnMove: false,
        },
        {
          kind: 'flashcards',
          title: 'فلش‌کارت‌های مرور',
          format: '.csv',
          accept: '.csv',
          modeTarget: 'flashcards',
          modeLabel: 'مرور فلش‌کارت‌ها',
          icon: FlashcardIcon,
          inputRef: flashcardsInputRef,
          present: hasFlashcards,
          displayName:
            selectedLesson.resourceLabels?.flashcards || `مجموعه فلش‌کارت ${selectedLesson.title}`,
          metaText: hasFlashcards
            ? `${totalLessonFlashcards} کارت${selectedCustomCards.length > 0 ? ` (${selectedCustomCards.length} کارت شخصی)` : ''}`
            : 'فایل فلش‌کارت ثبت نشده است',
          supportsAppendOnMove: true,
        },
        {
          kind: 'quiz',
          title: 'آزمون تستی',
          format: '.json',
          accept: '.json',
          modeTarget: 'quiz',
          modeLabel: 'شروع آزمون',
          icon: CheckSquare,
          inputRef: quizInputRef,
          present: hasQuiz,
          displayName: selectedLesson.resourceLabels?.quiz || `آزمون ${selectedLesson.title}`,
          metaText: hasQuiz
            ? `${selectedLesson.quiz.length} سوال${multiQuizCount > 0 ? ` · ${multiQuizCount} چندگزینه‌ای` : ''}`
            : 'فایل آزمون ثبت نشده است',
          supportsAppendOnMove: true,
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-6 lg:px-10 lg:py-8">
      {/* Delete Course Confirmation Modal */}
      {confirmDeleteCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#0F172A]/50 backdrop-blur-[2px]"
            onClick={() => setConfirmDeleteCourse(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="تایید حذف درس"
            className="elevation-tier-3 relative z-10 w-full max-w-[440px] rounded-2xl bg-white p-6 dark:bg-[#1C252E]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#DC2626] dark:bg-[#7F1D1D]/40 dark:text-[#F87171]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  حذف درس «{confirmDeleteCourse.name}»؟
                </h2>
                <p className="mt-1.5 text-xs leading-6 text-[#475569] dark:text-[#94A3B8]">
                  با تایید این عملیات، این درس همراه با{' '}
                  <span className="font-semibold tabular-nums text-[#0F172A] dark:text-[#F1F5F9]">
                    {lessons.filter((l) => l.courseId === confirmDeleteCourse.id).length} جلسه / جزوه زیرمجموعه
                  </span>{' '}
                  و تمام منابع آن‌ها به صورت دائمی حذف می‌شود.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteCourse(null)}
                className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1] dark:hover:bg-[#24303C]"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCourse}
                className="rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C]"
              >
                تایید و حذف درس
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Session Confirmation Modal */}
      {confirmDeleteLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#0F172A]/50 backdrop-blur-[2px]"
            onClick={() => setConfirmDeleteLesson(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="تایید حذف جلسه"
            className="elevation-tier-3 relative z-10 w-full max-w-[440px] rounded-2xl bg-white p-6 dark:bg-[#1C252E]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#DC2626] dark:bg-[#7F1D1D]/40 dark:text-[#F87171]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  حذف جلسه «{confirmDeleteLesson.title}»؟
                </h2>
                <p className="mt-1.5 text-xs leading-6 text-[#475569] dark:text-[#94A3B8]">
                  با تایید این عملیات، این جلسه و تمام منابع متصل به آن شامل{' '}
                  <span className="font-semibold tabular-nums text-[#0F172A] dark:text-[#F1F5F9]">
                    {confirmDeleteLesson.sections.length} بخش جزوه،{' '}
                    {confirmDeleteLesson.flashcards.length +
                      (customCardsByLesson[confirmDeleteLesson.id]?.length ?? 0)}{' '}
                    فلش‌کارت و {confirmDeleteLesson.quiz.length} سوال آزمون
                  </span>{' '}
                  به صورت دائمی حذف می‌شوند.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteLesson(null)}
                className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1] dark:hover:bg-[#24303C]"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLesson}
                className="rounded-lg bg-[#DC2626] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C]"
              >
                تایید و حذف جلسه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Workspace Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[#E2E8F0] pb-5 dark:border-[#27323E] sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <FolderCog className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
            <span>جادرسی</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-[#0F172A] dark:text-[#E2E8F0]">مدیریت منابع</span>
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-tight text-[#0F172A] dark:text-[#F8FAFC] sm:text-2xl">
            مدیریت درس‌ها، جلسات و منابع آموزشی
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#64748B] tabular-nums dark:text-[#94A3B8]">
            <span>{courses.length} درس</span>
            <span aria-hidden="true">·</span>
            <span>{lessons.length} جلسه / جزوه</span>
            <span aria-hidden="true">·</span>
            <span>{aggregateStats.sections} بخش جزوه</span>
            <span aria-hidden="true">·</span>
            <span>{aggregateStats.cards} فلش‌کارت</span>
            <span aria-hidden="true">·</span>
            <span>{aggregateStats.questions} سوال آزمون</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenBatchImport}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
          >
            <FileUp className="h-3.5 w-3.5 shrink-0" />
            <span>ورود فایل‌ها</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(false);
              setShowCreateCourseForm((v) => !v);
            }}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0D9488]/40 bg-[#F0FDFA] px-3.5 py-2 text-xs font-semibold text-[#0F766E] transition-colors hover:border-[#0D9488] dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF]"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span>درس جدید</span>
          </button>
          <button
            type="button"
            onClick={() => openNewSessionForCourse()}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>جلسه / جزوه جدید</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
            feedback.type === 'success'
              ? 'border-[#6EE7B7] bg-[#ECFDF5] text-[#065F46] dark:border-[#047857]/70 dark:bg-[#064E3B]/30 dark:text-[#A7F3D0]'
              : 'border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/30 dark:text-[#FCA5A5]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="بستن پیام"
            className="rounded p-1 opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Inline Create Course Form (Top-Level Subject) */}
      {showCreateCourseForm && (
        <form
          onSubmit={handleCreateCourseSubmit}
          className="mb-6 rounded-xl border border-[#0D9488]/35 bg-[#FAF9F6] p-5 dark:border-[#14B8A6]/40 dark:bg-[#161D24]"
        >
          <div className="mb-3.5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                ایجاد درس (سرفصل اصلی) جدید
              </h2>
              <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                درس‌ها پوشه اصلی هستند و جلسات، جزوه‌ها و آزمون‌ها در زیرمجموعه هر درس قرار می‌گیرند.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateCourseForm(false)}
              aria-label="بستن فرم"
              className="rounded-md p-1 text-[#64748B] hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                نام درس *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="مثلاً: بیوشیمی پیشرفته یا الگوریتم‌ها"
                className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                کد درس (اختیاری)
              </label>
              <input
                type="text"
                dir="ltr"
                value={newCourseCode}
                onChange={(e) => setNewCourseCode(e.target.value)}
                placeholder="BIO-301"
                className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateCourseForm(false)}
              className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569] hover:bg-white dark:border-[#364554] dark:text-[#CBD5E1] dark:hover:bg-[#1C252E]"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
            >
              ثبت درس جدید
            </button>
          </div>
        </form>
      )}

      {/* Inline Create Session / Lecture Form (Child of Course) */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateLessonSubmit}
          className="mb-6 rounded-xl border border-[#0D9488]/35 bg-[#FAF9F6] p-5 dark:border-[#14B8A6]/40 dark:bg-[#161D24]"
        >
          <div className="mb-3.5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                افزودن جلسه / جزوه جدید
              </h2>
              <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                این جلسه به عنوان زیرمجموعه درس انتخاب‌شده ایجاد می‌شود و فایل‌های جزوه، مایندمپ، فلش‌کارت و آزمون آن را نگهداری می‌کند.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              aria-label="بستن فرم"
              className="rounded-md p-1 text-[#64748B] hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                عنوان جلسه / فصل *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="مثلاً: جلسه اول - ساختار پروتئین‌ها"
                className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                متعلق به درس
              </label>
              {courses.length > 0 ? (
                <select
                  value={newCourseId}
                  onChange={(e) => setNewCourseId(e.target.value)}
                  className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">+ ساخت درس جدید...</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={newCourse}
                  onChange={(e) => setNewCourse(e.target.value)}
                  placeholder="نام درس (مثلاً: بیوشیمی)"
                  className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
                />
              )}
              {courses.length > 0 && newCourseId === '__new__' && (
                <input
                  type="text"
                  required
                  value={newCourse}
                  onChange={(e) => setNewCourse(e.target.value)}
                  placeholder="نام درس جدید..."
                  className="archival-input mt-2 w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                کد جلسه
              </label>
              <input
                type="text"
                dir="ltr"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder={`S-${101 + lessons.length}`}
                className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569] hover:bg-white dark:border-[#364554] dark:text-[#CBD5E1] dark:hover:bg-[#1C252E]"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
            >
              ثبت جلسه جدید
            </button>
          </div>
        </form>
      )}

      {/* Empty State when neither courses nor sessions exist yet */}
      {courses.length === 0 && lessons.length === 0 ? (
        <div className="elevation-tier-1 rounded-2xl border border-[#E2E8F0] bg-[#FAF9F6] px-6 py-12 text-center dark:border-[#27323E] dark:bg-[#161D24] sm:px-10 sm:py-16">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#0D9488]/25 bg-[#F0FDFA] text-[#0D9488] dark:border-[#14B8A6]/30 dark:bg-[#0F2928] dark:text-[#2DD4BF]">
            <FolderCog className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            هنوز درسی در جادرسی ایجاد نشده است
          </h2>
          <p className="mx-auto mt-2 max-w-[520px] text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
            ابتدا یک درس (مانند بیوشیمی یا الگوریتم) بسازید و سپس جلسات و فایل‌های جزوه، مایندمپ، فلش‌کارت و آزمون تستی را زیرمجموعه آن اضافه کنید.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenBatchImport}
              className="flex items-center gap-2 rounded-xl bg-[#0D9488] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
            >
              <FileUp className="h-4 w-4 shrink-0" />
              <span>ورود فایل‌ها (.md / .csv / .json)</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreateCourseForm(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[#0D9488]/40 bg-[#F0FDFA] px-4 py-2.5 text-xs font-semibold text-[#0F766E] transition-colors hover:border-[#0D9488] dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF]"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span>ساخت درس جدید</span>
            </button>
            <button
              type="button"
              onClick={() => openNewSessionForCourse()}
              className="flex items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-4 py-2.5 text-xs font-semibold text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#E2E8F0] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>ساخت جلسه جدید</span>
            </button>
          </div>

          <div className="mx-auto mt-8 grid max-w-[680px] grid-cols-2 gap-3 border-t border-[#E2E8F0] pt-6 text-right dark:border-[#27323E] sm:grid-cols-4">
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 dark:border-[#27323E] dark:bg-[#1C252E]">
              <BookOpen className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
              <p className="mt-2 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">جزوه درسی</p>
              <p className="ltr-inline mt-0.5 font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">.md</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 dark:border-[#27323E] dark:bg-[#1C252E]">
              <Network className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
              <p className="mt-2 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">مایندمپ</p>
              <p className="ltr-inline mt-0.5 font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">.json</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 dark:border-[#27323E] dark:bg-[#1C252E]">
              <FlashcardIcon className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
              <p className="mt-2 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">فلش‌کارت</p>
              <p className="ltr-inline mt-0.5 font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">.csv</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 dark:border-[#27323E] dark:bg-[#1C252E]">
              <CheckSquare className="h-4 w-4 text-[#0D9488] dark:text-[#2DD4BF]" />
              <p className="mt-2 text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9]">آزمون تستی</p>
              <p className="ltr-inline mt-0.5 font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">.json</p>
            </div>
          </div>
        </div>
      ) : (
      /* 2-Column Split Management Workspace */
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Right Column (RTL Start): Courses & Sessions Tree with Drag-and-Drop */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-[#FAF9F6] p-4 dark:border-[#27323E] dark:bg-[#161D24]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
              درس‌ها ({courses.length}) و جلسات ({lessons.length})
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setShowCreateCourseForm(true);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-[#0D9488] hover:underline dark:text-[#2DD4BF]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>درس جدید</span>
            </button>
          </div>
          <p className="mb-3 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            برای تغییر ترتیب درس‌ها یا تغییر ترتیب جلسات درون هر درس، آیکون دستگیره را بکشید و رها کنید.
          </p>

          {/* Search input */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={lessonSearch}
              onChange={(e) => setLessonSearch(e.target.value)}
              placeholder="جستجوی نام درس یا جلسه..."
              className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pl-3 pr-8 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0D9488] focus:outline-none dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
            />
          </div>

          {/* Courses -> Sessions Collapsible List with Drag & Drop */}
          <div className="space-y-2.5">
            {groupedCourses.groups.length === 0 && groupedCourses.orphanLessons.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                موردی با این عبارت یافت نشد.
              </p>
            ) : (
              groupedCourses.groups.map(({ course, lessons: courseLessons, totalLessons }) => {
                const isCollapsed = collapsedCourses.has(course.id);
                const isEditingCourse = editingCourseId === course.id;
                const isCourseDropTarget =
                  dropTarget?.type === 'course' && dropTarget.id === course.id;

                return (
                  <div
                    key={course.id}
                    draggable={!isEditingCourse}
                    onDragStart={(e) => {
                      if (isEditingCourse) return;
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', `course:${course.id}`);
                      setDragState({ type: 'course', id: course.id });
                    }}
                    onDragEnd={() => {
                      setDragState(null);
                      setDropTarget(null);
                    }}
                    onDragOver={(e) => {
                      if (dragState?.type !== 'course' || dragState.id === course.id) return;
                      e.preventDefault();
                      setDropTarget({ type: 'course', id: course.id });
                    }}
                    onDrop={(e) => {
                      if (dragState?.type !== 'course' || dragState.id === course.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onReorderCourses(dragState.id, course.id);
                      setDragState(null);
                      setDropTarget(null);
                    }}
                    className={`rounded-xl border transition-colors ${
                      isCourseDropTarget
                        ? 'border-[#0D9488] bg-[#F0FDFA]/60 dark:border-[#14B8A6] dark:bg-[#0F2928]/40'
                        : 'border-[#E2E8F0] bg-white/80 dark:border-[#27323E] dark:bg-[#1C252E]/60'
                    }`}
                  >
                    {/* Course Header */}
                    {isEditingCourse ? (
                      <form
                        onSubmit={(e) => handleSaveCourseRename(e, course.id)}
                        className="space-y-2 p-2.5"
                      >
                        <input
                          type="text"
                          required
                          autoFocus
                          value={editCourseName}
                          onChange={(e) => setEditCourseName(e.target.value)}
                          placeholder="نام درس"
                          className="w-full rounded-md border border-[#CBD5E1] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-semibold text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
                        />
                        <input
                          type="text"
                          dir="ltr"
                          value={editCourseCode}
                          onChange={(e) => setEditCourseCode(e.target.value)}
                          placeholder="کد درس (اختیاری)"
                          className="w-full rounded-md border border-[#CBD5E1] bg-[#FAF9F6] px-2.5 py-1 font-mono text-[11px] text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingCourseId(null)}
                            className="rounded-md px-2.5 py-1 text-[11px] text-[#64748B] hover:bg-[#F1F5F9] dark:text-[#94A3B8]"
                          >
                            انصراف
                          </button>
                          <button
                            type="submit"
                            className="flex items-center gap-1 rounded-md bg-[#0D9488] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0F766E]"
                          >
                            <Check className="h-3 w-3" />
                            <span>ذخیره</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-2">
                        <span
                          title="کشیدن برای جابه‌جایی درس"
                          className="cursor-grab text-[#94A3B8] hover:text-[#475569] active:cursor-grabbing dark:hover:text-[#CBD5E1]"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            toggleCourseCollapsed(course.id);
                            if (totalLessons === 0) {
                              setSelectedCourseId(course.id);
                              setSelectedId('');
                            }
                          }}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-right"
                        >
                          {isCollapsed ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                          ) : (
                            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                          )}
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#0D9488] dark:text-[#2DD4BF]" />
                          <span className="truncate text-xs font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                            {course.name}
                          </span>
                          <span className="shrink-0 rounded-md bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#475569] tabular-nums dark:bg-[#27323E] dark:text-[#CBD5E1]">
                            {totalLessons} جلسه
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openNewSessionForCourse(course.id)}
                            title="افزودن جلسه به این درس"
                            aria-label={`افزودن جلسه به ${course.name}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[#0D9488] hover:bg-[#F0FDFA] dark:text-[#2DD4BF] dark:hover:bg-[#0F2928]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditingCourse(course)}
                            title="ویرایش نام درس"
                            aria-label={`ویرایش درس ${course.name}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E]"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCourse(course)}
                            title="حذف درس"
                            aria-label={`حذف درس ${course.name}`}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:text-[#94A3B8] dark:hover:bg-[#7F1D1D]/30"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Nested Sessions inside Course */}
                    {!isCollapsed && (
                      <div className="space-y-1 border-t border-[#E2E8F0] p-1.5 dark:border-[#27323E]">
                        {courseLessons.length === 0 ? (
                          <div className="flex items-center justify-between px-2 py-2 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            <span>هنوز جلسه‌ای ثبت نشده است</span>
                            <button
                              type="button"
                              onClick={() => openNewSessionForCourse(course.id)}
                              className="font-semibold text-[#0D9488] hover:underline dark:text-[#2DD4BF]"
                            >
                              + افزودن جلسه
                            </button>
                          </div>
                        ) : (
                          courseLessons.map((lesson) => {
                            const isSelected = selectedLesson?.id === lesson.id;
                            const isEditing = editingLessonId === lesson.id;
                            const resCount = getLessonResourceCount(lesson);
                            const isLessonDropTarget =
                              dropTarget?.type === 'lesson' && dropTarget.id === lesson.id;

                            if (isEditing) {
                              return (
                                <form
                                  key={lesson.id}
                                  onSubmit={(e) => handleSaveLessonRename(e, lesson.id)}
                                  className="space-y-2 rounded-lg border border-[#0D9488] bg-white p-2.5 dark:border-[#14B8A6] dark:bg-[#161D24]"
                                >
                                  <input
                                    type="text"
                                    required
                                    autoFocus
                                    value={editLessonTitle}
                                    onChange={(e) => setEditLessonTitle(e.target.value)}
                                    placeholder="عنوان جلسه"
                                    className="w-full rounded-md border border-[#CBD5E1] bg-[#FAF9F6] px-2.5 py-1.5 text-xs font-medium text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F8FAFC]"
                                  />
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <select
                                      value={editLessonCourseId}
                                      onChange={(e) => setEditLessonCourseId(e.target.value)}
                                      className="w-full rounded-md border border-[#CBD5E1] bg-[#FAF9F6] px-2 py-1 text-[11px] text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
                                    >
                                      {courses.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      dir="ltr"
                                      value={editLessonCode}
                                      onChange={(e) => setEditLessonCode(e.target.value)}
                                      placeholder="کد جلسه"
                                      className="w-full rounded-md border border-[#CBD5E1] bg-[#FAF9F6] px-2 py-1 font-mono text-[11px] text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
                                    />
                                  </div>
                                  <div className="flex items-center justify-end gap-1.5 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setEditingLessonId(null)}
                                      className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[#64748B] hover:bg-[#F1F5F9] dark:text-[#94A3B8] dark:hover:bg-[#27323E]"
                                    >
                                      انصراف
                                    </button>
                                    <button
                                      type="submit"
                                      className="flex items-center gap-1 rounded-md bg-[#0D9488] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#0F766E]"
                                    >
                                      <Check className="h-3 w-3" />
                                      <span>ذخیره</span>
                                    </button>
                                  </div>
                                </form>
                              );
                            }

                            return (
                              <div
                                key={lesson.id}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', `lesson:${lesson.id}`);
                                  setDragState({
                                    type: 'lesson',
                                    id: lesson.id,
                                    courseId: course.id,
                                  });
                                }}
                                onDragEnd={() => {
                                  setDragState(null);
                                  setDropTarget(null);
                                }}
                                onDragOver={(e) => {
                                  if (
                                    dragState?.type !== 'lesson' ||
                                    dragState.id === lesson.id ||
                                    dragState.courseId !== course.id
                                  ) {
                                    return;
                                  }
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDropTarget({ type: 'lesson', id: lesson.id });
                                }}
                                onDragLeave={() => {
                                  setDropTarget((prev) =>
                                    prev?.type === 'lesson' && prev.id === lesson.id ? null : prev
                                  );
                                }}
                                onDrop={(e) => {
                                  if (
                                    dragState?.type !== 'lesson' ||
                                    dragState.id === lesson.id ||
                                    dragState.courseId !== course.id
                                  ) {
                                    return;
                                  }
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onReorderLessons(dragState.id, lesson.id, course.id);
                                  setDragState(null);
                                  setDropTarget(null);
                                }}
                                className={`group rounded-lg border px-2 py-2 transition-colors ${
                                  isLessonDropTarget
                                    ? 'border-[#0D9488] bg-[#F0FDFA] dark:border-[#14B8A6] dark:bg-[#0F2928]'
                                    : isSelected
                                    ? 'border-[#0D9488]/45 bg-[#F0FDFA]/60 dark:border-[#14B8A6]/45 dark:bg-[#0F2928]/45'
                                    : 'border-transparent hover:border-[#E2E8F0] hover:bg-[#FAF9F6] dark:hover:border-[#27323E] dark:hover:bg-[#161D24]'
                                }`}
                              >
                                <div className="flex items-start gap-1.5">
                                  <span
                                    title="کشیدن برای تغییر ترتیب جلسه درون همین درس"
                                    className="mt-1 cursor-grab text-[#94A3B8] hover:text-[#475569] active:cursor-grabbing dark:hover:text-[#CBD5E1]"
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedCourseId(null);
                                      setSelectedId(lesson.id);
                                      onSelectLesson(lesson.id);
                                    }}
                                    className="min-w-0 flex-1 text-right"
                                  >
                                    <div className="flex items-center gap-1.5 text-[10px] text-[#64748B] tabular-nums dark:text-[#94A3B8]">
                                      <span>جلسه {lesson.chapterNumber}</span>
                                      <span aria-hidden="true">·</span>
                                      <span className="ltr-inline font-mono">{lesson.code}</span>
                                      <span aria-hidden="true">·</span>
                                      <span>{resCount}/۴ محتوا</span>
                                    </div>
                                    <p
                                      className={`mt-0.5 truncate text-xs font-semibold ${
                                        isSelected
                                          ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                                          : 'text-[#0F172A] dark:text-[#F1F5F9]'
                                      }`}
                                    >
                                      {lesson.title}
                                    </p>
                                  </button>

                                  <div className="flex shrink-0 items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => startEditingLesson(lesson)}
                                      title="ویرایش نام و درس جلسه"
                                      aria-label={`ویرایش نام ${lesson.title}`}
                                      className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-white hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E] dark:hover:text-[#F8FAFC]"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteLesson(lesson)}
                                      title="حذف جلسه"
                                      aria-label={`حذف ${lesson.title}`}
                                      className="flex h-6 w-6 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:text-[#94A3B8] dark:hover:bg-[#7F1D1D]/30 dark:hover:text-[#F87171]"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Left Column (RTL Main): Per-Session Resource Manager */}
        <section className="rounded-2xl border border-[#E2E8F0] bg-[#FAF9F6] p-5 dark:border-[#27323E] dark:bg-[#161D24] sm:p-6">
          {!selectedLesson ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[#0D9488]/25 bg-[#F0FDFA] text-[#0D9488] dark:border-[#14B8A6]/30 dark:bg-[#0F2928] dark:text-[#2DD4BF]">
                <FolderOpen className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                {selectedCourse
                  ? `درس «${selectedCourse.name}» هنوز جلسه‌ای ندارد`
                  : 'هنوز جلسه‌ای برای مدیریت منابع انتخاب نشده است'}
              </p>
              <p className="mt-1.5 text-xs text-[#64748B] dark:text-[#94A3B8]">
                {selectedCourse
                  ? 'می‌توانید به تعداد دلخواه جلسه به این درس اضافه کنید و جزوه، مایندمپ، فلش‌کارت و آزمون هر جلسه را جداگانه مدیریت نمایید.'
                  : 'از دکمه «جلسه / جزوه جدید» اولین جلسه را زیرمجموعه یکی از درس‌ها ایجاد کنید.'}
              </p>
              <button
                type="button"
                onClick={() => openNewSessionForCourse(selectedCourse?.id ?? courses[0]?.id)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {selectedCourse
                    ? `افزودن اولین جلسه به «${selectedCourse.name}»`
                    : 'افزودن جلسه جدید'}
                </span>
              </button>
            </div>
          ) : (
            <>
          {/* Selected Session Header */}
          <div className="flex flex-col justify-between gap-3 border-b border-[#E2E8F0] pb-5 dark:border-[#27323E] sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#64748B] tabular-nums dark:text-[#94A3B8]">
                <span className="inline-flex items-center gap-1 font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
                  <FolderOpen className="h-3.5 w-3.5 text-[#0D9488] dark:text-[#2DD4BF]" />
                  <span>درس: {selectedLesson.course}</span>
                </span>
                <span aria-hidden="true">/</span>
                <span className="font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                  جلسه {selectedLesson.chapterNumber} از {selectedCourseSessionCount}
                </span>
                <span aria-hidden="true">·</span>
                <span className="ltr-inline font-mono">{selectedLesson.code}</span>
                <span aria-hidden="true">·</span>
                <span>بروزرسانی: {selectedLesson.lastUpdated}</span>
              </div>
              <h2 className="mt-1.5 text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC] sm:text-xl">
                {selectedLesson.title}
              </h2>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => startEditingLesson(selectedLesson)}
                className="flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF]"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>ویرایش جلسه</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenLessonInMode(selectedLesson.id, 'notes')}
                className="flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>باز کردن جلسه</span>
              </button>
            </div>
          </div>

          {/* 4 Per-Lesson Resource Rows */}
          <div className="mt-5 divide-y divide-[#E2E8F0] dark:divide-[#27323E]">
            {resourceItems.map((res) => {
              const Icon = res.icon;
              const isRenaming = renamingKind === res.kind;
              const isMoving = movingKind === res.kind;
              const isConfirmingDelete = confirmDeleteKind === res.kind;
              const isDragging = draggingKind === res.kind;

              return (
                <div
                  key={res.kind}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingKind(res.kind);
                  }}
                  onDragLeave={() => setDraggingKind((prev) => (prev === res.kind ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDraggingKind(null);
                    const file = e.dataTransfer.files?.[0];
                    void handleResourceFile(res.kind, file);
                  }}
                  className={`py-5 first:pt-1 last:pb-1 transition-colors ${
                    isDragging
                      ? 'rounded-xl bg-[#F0FDFA]/80 px-3 dark:bg-[#0F2928]/60'
                      : ''
                  }`}
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    {/* Resource Identity & Metadata */}
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                          res.present
                            ? 'border-[#0D9488]/30 bg-[#F0FDFA] text-[#0F766E] dark:border-[#14B8A6]/35 dark:bg-[#0F2928] dark:text-[#2DD4BF]'
                            : 'border-[#E2E8F0] bg-white text-[#94A3B8] dark:border-[#27323E] dark:bg-[#1C252E]'
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <h3 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                            {res.title}
                          </h3>
                          <span className="ltr-inline font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                            {res.format}
                          </span>
                          <span aria-hidden="true" className="text-[#CBD5E1] dark:text-[#364554]">
                            ·
                          </span>
                          <span
                            className={`text-xs font-medium ${
                              res.present
                                ? 'text-[#059669] dark:text-[#34D399]'
                                : 'text-[#94A3B8] dark:text-[#64748B]'
                            }`}
                          >
                            {res.present ? 'آماده مطالعه' : 'خالی'}
                          </span>
                        </div>

                        {res.present && (
                          <p className="mt-1 truncate text-xs font-medium text-[#334155] dark:text-[#E2E8F0]">
                            {res.displayName}
                          </p>
                        )}

                        <p className="mt-0.5 text-xs text-[#64748B] tabular-nums dark:text-[#94A3B8]">
                          {res.metaText}
                          {isDragging ? ' — فایل را اینجا رها کنید' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Resource Actions */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        ref={res.inputRef}
                        type="file"
                        accept={res.accept}
                        className="hidden"
                        onChange={(e) => {
                          void handleResourceFile(res.kind, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => res.inputRef.current?.click()}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#0D9488]/40 bg-[#F0FDFA] px-3 py-1.5 text-xs font-semibold text-[#0F766E] transition-colors hover:border-[#0D9488] hover:bg-[#CCFBF1]/60 dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF]"
                      >
                        <Upload className="h-3.5 w-3.5 shrink-0" />
                        <span>{res.present ? 'جایگزینی فایل' : 'افزودن فایل'}</span>
                      </button>

                      {res.present && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setMovingKind(null);
                              setConfirmDeleteKind(null);
                              setRenamingKind(isRenaming ? null : res.kind);
                              setRenameDraft(res.displayName);
                            }}
                            title="تغییر نام منبع"
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]"
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0" />
                            <span>تغییر نام</span>
                          </button>

                          {otherLessons.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                isMoving ? setMovingKind(null) : startMoveResource(res.kind)
                              }
                              title="انتقال این منبع به درس دیگر"
                              className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:border-[#CBD5E1] hover:text-[#0F172A] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:text-[#F8FAFC]"
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                              <span>انتقال</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenLessonInMode(selectedLesson.id, res.modeTarget)}
                            title={res.modeLabel}
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span>نمایش</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setRenamingKind(null);
                              setMovingKind(null);
                              setConfirmDeleteKind(isConfirmingDelete ? null : res.kind);
                            }}
                            title="حذف منبع"
                            aria-label={`حذف ${res.title}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] transition-colors hover:border-[#FCA5A5] hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:border-[#27323E] dark:bg-[#1C252E] dark:text-[#94A3B8] dark:hover:border-[#B91C1C]/60 dark:hover:bg-[#7F1D1D]/30 dark:hover:text-[#F87171]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline Rename Resource Drawer */}
                  {isRenaming && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const clean = renameDraft.trim();
                        if (!clean) return;
                        onRenameResource(selectedLesson.id, res.kind, clean);
                        setRenamingKind(null);
                        showNotice('success', `نام ${res.title} به «${clean}» تغییر یافت.`);
                      }}
                      className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white p-3 dark:border-[#364554] dark:bg-[#1C252E]"
                    >
                      <label className="text-xs font-medium text-[#475569] dark:text-[#CBD5E1]">
                        نام جدید منبع:
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        className="min-w-[200px] flex-1 rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-3 py-1.5 text-xs text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F8FAFC]"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRenamingKind(null)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] dark:text-[#94A3B8] dark:hover:bg-[#27323E]"
                        >
                          انصراف
                        </button>
                        <button
                          type="submit"
                          className="rounded-lg bg-[#0D9488] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0F766E]"
                        >
                          ذخیره نام
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Inline Move / Reassign Resource Drawer */}
                  {isMoving && otherLessons.length > 0 && (
                    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[#CBD5E1] bg-white p-3.5 dark:border-[#364554] dark:bg-[#1C252E] sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-1 flex-wrap items-center gap-2.5">
                        <label className="text-xs font-medium text-[#475569] dark:text-[#CBD5E1]">
                          انتقال به جلسه:
                        </label>
                        <select
                          value={moveTargetId}
                          onChange={(e) => setMoveTargetId(e.target.value)}
                          className="min-w-[200px] flex-1 rounded-lg border border-[#CBD5E1] bg-[#FAF9F6] px-3 py-1.5 text-xs font-medium text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                        >
                          {courses.map((c) => {
                            const targetsInCourse = otherLessons.filter((t) =>
                              t.courseId ? t.courseId === c.id : t.course === c.name
                            );
                            if (targetsInCourse.length === 0) return null;
                            return (
                              <optgroup key={c.id} label={`درس: ${c.name}`}>
                                {targetsInCourse.map((target) => (
                                  <option key={target.id} value={target.id}>
                                    جلسه {target.chapterNumber}: {target.title} ({target.code})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>

                        {res.supportsAppendOnMove && (
                          <div className="flex items-center gap-1 rounded-lg bg-[#F1F5F9] p-0.5 text-[11px] dark:bg-[#161D24]">
                            <button
                              type="button"
                              onClick={() => setMoveStrategy('replace')}
                              className={`rounded-md px-2.5 py-1 transition-colors ${
                                moveStrategy === 'replace'
                                  ? 'bg-white font-semibold text-[#0F766E] dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                                  : 'text-[#64748B] dark:text-[#94A3B8]'
                              }`}
                            >
                              جایگزینی در مقصد
                            </button>
                            <button
                              type="button"
                              onClick={() => setMoveStrategy('append')}
                              className={`rounded-md px-2.5 py-1 transition-colors ${
                                moveStrategy === 'append'
                                  ? 'bg-white font-semibold text-[#0F766E] dark:bg-[#1C252E] dark:text-[#2DD4BF]'
                                  : 'text-[#64748B] dark:text-[#94A3B8]'
                              }`}
                            >
                              افزودن به مقصد
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMovingKind(null)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#64748B] hover:bg-[#F1F5F9] dark:text-[#94A3B8] dark:hover:bg-[#27323E]"
                        >
                          انصراف
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmMove(res.kind)}
                          className="flex items-center gap-1 rounded-lg bg-[#0D9488] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0F766E]"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          <span>تایید انتقال</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Delete Resource Confirmation */}
                  {isConfirmingDelete && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-2.5 text-xs text-[#991B1B] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/25 dark:text-[#FCA5A5]">
                      <span>
                        آیا از حذف <strong>{res.title}</strong> از جلسه «{selectedLesson.title}» مطمئن هستید؟
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKind(null)}
                          className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-[#334155] hover:bg-[#F8FAFC] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
                        >
                          انصراف
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmDeleteResource(res.kind)}
                          className="rounded-lg bg-[#DC2626] px-3 py-1 text-xs font-semibold text-white hover:bg-[#B91C1C]"
                        >
                          حذف منبع
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expandable Lecture Section Titles Renamer */}
                  {res.kind === 'lecture' && hasLecture && (
                    <div className="mt-3 pr-13">
                      <button
                        type="button"
                        onClick={() => setSectionsExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-[#64748B] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:text-[#F8FAFC]"
                      >
                        {sectionsExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {sectionsExpanded
                            ? 'بستن فهرست بخش‌های جزوه'
                            : `مشاهده و تغییر نام بخش‌های جزوه (${selectedLesson.sections.length})`}
                        </span>
                      </button>

                      {sectionsExpanded && (
                        <ul className="mt-2.5 space-y-1.5 border-r border-[#E2E8F0] pr-3 dark:border-[#27323E]">
                          {selectedLesson.sections.map((sec) => {
                            const isSecEditing = editingSectionId === sec.id;
                            return (
                              <li
                                key={sec.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                {isSecEditing ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const clean = sectionTitleDraft.trim();
                                      if (!clean) return;
                                      onRenameSection(selectedLesson.id, sec.id, clean);
                                      setEditingSectionId(null);
                                      showNotice('success', `عنوان بخش به «${clean}» تغییر یافت.`);
                                    }}
                                    className="flex flex-1 items-center gap-1.5"
                                  >
                                    <span className="font-mono text-[11px] text-[#0D9488] tabular-nums">
                                      {sec.number}
                                    </span>
                                    <input
                                      type="text"
                                      required
                                      autoFocus
                                      value={sectionTitleDraft}
                                      onChange={(e) => setSectionTitleDraft(e.target.value)}
                                      className="flex-1 rounded border border-[#0D9488] bg-white px-2 py-1 text-xs text-[#0F172A] focus:outline-none dark:bg-[#1C252E] dark:text-[#F8FAFC]"
                                    />
                                    <button
                                      type="submit"
                                      className="rounded bg-[#0D9488] px-2 py-1 text-[11px] font-semibold text-white"
                                    >
                                      ذخیره
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSectionId(null)}
                                      className="rounded px-2 py-1 text-[11px] text-[#64748B]"
                                    >
                                      لغو
                                    </button>
                                  </form>
                                ) : (
                                  <>
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span className="font-mono text-[11px] text-[#0D9488] tabular-nums dark:text-[#2DD4BF]">
                                        {sec.number}
                                      </span>
                                      <span className="truncate text-[#334155] dark:text-[#CBD5E1]">
                                        {sec.title}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingSectionId(sec.id);
                                        setSectionTitleDraft(sec.title);
                                      }}
                                      title="تغییر نام این بخش"
                                      className="shrink-0 rounded p-1 text-[#94A3B8] hover:bg-white hover:text-[#0F172A] dark:hover:bg-[#1C252E] dark:hover:text-[#F8FAFC]"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
        </section>
      </div>
      )}
    </div>
  );
};
