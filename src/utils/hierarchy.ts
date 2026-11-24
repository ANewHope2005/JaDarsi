import { Course, Lesson } from '../types/study';

export function makeUniqueId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Enforces the strict 3-level hierarchy invariant:
 *   Level 1: Course ("درس")
 *   Level 2: Session ("جلسه", unlimited per course, numbered 1..N inside each course)
 *   Level 3: Session contents (lecture sections, mindmap, flashcards, quiz)
 *
 * Guarantees:
 * - Every session has a valid `courseId` pointing to an existing Course.
 * - Every session's `course` display name stays synced with its parent Course.
 * - Sessions are ordered in Course order while preserving relative intra-course session order.
 * - `chapterNumber` is numbered 1..N independently per Course (no cap).
 * - Never injects default/sample data when empty.
 */
export function normalizeHierarchy(
  courses: Course[],
  lessons: Lesson[],
  defaultDate: string
): { courses: Course[]; lessons: Lesson[] } {
  const nextCourses: Course[] = courses.map((c) => ({
    ...c,
    name: c.name.trim() || 'درس بدون عنوان',
  }));

  const courseById = new Map<string, Course>();
  const courseByName = new Map<string, Course>();
  for (const c of nextCourses) {
    courseById.set(c.id, c);
    if (!courseByName.has(c.name)) {
      courseByName.set(c.name, c);
    }
  }

  // Link every session strictly to an existing courseId (creating a course only for legacy unlinked records)
  const linkedLessons: Lesson[] = lessons.map((lesson) => {
    let parent = lesson.courseId ? courseById.get(lesson.courseId) : undefined;
    if (!parent) {
      const fallbackName = (lesson.course || 'درس‌های من').trim();
      parent = courseByName.get(fallbackName);
      if (!parent) {
        parent = {
          id: makeUniqueId('course'),
          name: fallbackName,
          createdAt: defaultDate,
        };
        nextCourses.push(parent);
        courseById.set(parent.id, parent);
        courseByName.set(parent.name, parent);
      }
    }

    return {
      ...lesson,
      courseId: parent.id,
      course: parent.name,
    };
  });

  // Group sessions strictly under their parent Course in Course order, numbering 1..N per Course
  const buckets = new Map<string, Lesson[]>();
  for (const c of nextCourses) {
    buckets.set(c.id, []);
  }
  for (const lesson of linkedLessons) {
    const cid = lesson.courseId!;
    const list = buckets.get(cid);
    if (list) {
      list.push(lesson);
    }
  }

  const orderedLessons: Lesson[] = [];
  for (const c of nextCourses) {
    const courseSessions = buckets.get(c.id) ?? [];
    courseSessions.forEach((session, idx) => {
      orderedLessons.push({
        ...session,
        courseId: c.id,
        course: c.name,
        chapterNumber: idx + 1,
      });
    });
  }

  return { courses: nextCourses, lessons: orderedLessons };
}

/**
 * Reorders top-level Courses and keeps all child Sessions cleanly ordered under their parent Courses.
 */
export function reorderCoursesHierarchy(
  courses: Course[],
  lessons: Lesson[],
  dragCourseId: string,
  targetCourseId: string,
  defaultDate: string
): { courses: Course[]; lessons: Lesson[] } {
  if (dragCourseId === targetCourseId) return { courses, lessons };
  const fromIdx = courses.findIndex((c) => c.id === dragCourseId);
  const toIdx = courses.findIndex((c) => c.id === targetCourseId);
  if (fromIdx === -1 || toIdx === -1) return { courses, lessons };

  const nextCourses = [...courses];
  const [moved] = nextCourses.splice(fromIdx, 1);
  nextCourses.splice(toIdx, 0, moved);

  return normalizeHierarchy(nextCourses, lessons, defaultDate);
}

/**
 * Reorders a Session strictly within its own parent Course.
 * Rejects any cross-course drop attempt so sessions cannot be dragged across courses.
 * Correctly handles both upward and downward drags so items can reach the first or last slot cleanly.
 */
export function reorderSessionsHierarchy(
  courses: Course[],
  lessons: Lesson[],
  dragLessonId: string,
  targetLessonId: string | null,
  targetCourseId: string | undefined,
  defaultDate: string
): { courses: Course[]; lessons: Lesson[] } {
  const fromIdx = lessons.findIndex((l) => l.id === dragLessonId);
  if (fromIdx === -1) return { courses, lessons };
  if (targetLessonId && dragLessonId === targetLessonId) return { courses, lessons };

  const dragged = lessons[fromIdx];
  const draggedCourseId = dragged.courseId;

  // Strictly block cross-course session drops
  if (targetCourseId && draggedCourseId && targetCourseId !== draggedCourseId) {
    return { courses, lessons };
  }

  if (!targetLessonId) {
    // Only allow dropping onto the same course container (no cross-course moves)
    if (!targetCourseId || targetCourseId !== draggedCourseId) {
      return { courses, lessons };
    }
  }

  const originalToIdx = targetLessonId
    ? lessons.findIndex((l) => l.id === targetLessonId)
    : -1;

  if (targetLessonId) {
    if (originalToIdx === -1) return { courses, lessons };
    const targetSession = lessons[originalToIdx];
    const sameParent =
      draggedCourseId && targetSession.courseId
        ? draggedCourseId === targetSession.courseId
        : dragged.course === targetSession.course;
    if (!sameParent) {
      return { courses, lessons };
    }
  }

  const nextLessons = [...lessons];
  const [moved] = nextLessons.splice(fromIdx, 1);

  if (targetLessonId && originalToIdx !== -1) {
    const newTargetIdx = nextLessons.findIndex((l) => l.id === targetLessonId);
    if (newTargetIdx !== -1) {
      // If dragging downward within the same course, place AFTER target; if upward, place BEFORE target
      const insertIdx = fromIdx < originalToIdx ? newTargetIdx + 1 : newTargetIdx;
      nextLessons.splice(insertIdx, 0, moved);
    } else {
      nextLessons.push(moved);
    }
  } else if (draggedCourseId) {
    // Dropped on own course container -> place at the end of its own course
    let lastIdx = -1;
    for (let i = 0; i < nextLessons.length; i++) {
      if (nextLessons[i].courseId === draggedCourseId) lastIdx = i;
    }
    if (lastIdx !== -1) {
      nextLessons.splice(lastIdx + 1, 0, moved);
    } else {
      nextLessons.push(moved);
    }
  } else {
    nextLessons.push(moved);
  }

  return normalizeHierarchy(courses, nextLessons, defaultDate);
}
