export type WorkspaceMode = 'notes' | 'mindmap' | 'flashcards' | 'quiz' | 'resources';

export type ResourceKind = 'lecture' | 'mindmap' | 'flashcards' | 'quiz';

export interface LessonResourceLabels {
  lecture?: string;
  mindmap?: string;
  flashcards?: string;
  quiz?: string;
}

export type ThemePreference =
  | 'system'
  | 'light'
  | 'eye-comfort'
  | 'sage'
  | 'dark'
  | 'midnight';

export interface Course {
  id: string;
  name: string;
  code?: string;
  createdAt?: string;
}

export type CalloutVariant = 'important' | 'example' | 'formula';

export interface ArticleCallout {
  id: string;
  variant: CalloutVariant;
  title: string;
  content: string;
  formula?: string;
  formulaCaption?: string;
}

export interface ArticleCodeBlock {
  language: string;
  caption: string;
  code: string;
}

export interface ArticleTable {
  caption?: string;
  headers: string[];
  rows: string[][];
  ltrColumns?: number[];
}

export interface ArticleSection {
  id: string;
  number: string;
  title: string;
  paragraphs: string[];
  markdownBody?: string;
  callouts?: ArticleCallout[];
  codeBlock?: ArticleCodeBlock;
  table?: ArticleTable;
  keyPoints?: string[];
}

export interface MindmapNode {
  id: string;
  title: string;
  subtitle?: string;
  summary: string;
  formula?: string;
  formulas?: string[];
  rules?: string[];
  examples?: string[];
  tables?: ArticleTable[];
  sectionId?: string;
  tag?: string;
  children?: MindmapNode[];
}

export interface Flashcard {
  id: string;
  front: string;
  frontFormula?: string;
  back: string;
  backFormula?: string;
  category: string;
  sectionId?: string;
  isCustom?: boolean;
}

export type FlashcardStatus = 'unseen' | 'review' | 'mastered';

export type QuizQuestionType = 'single' | 'multi';

export interface QuizOption {
  id: string;
  text: string;
  formula?: string;
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  promptFormula?: string;
  options: QuizOption[];
  correctOptionIds: string[];
  explanation: string;
  sectionId?: string;
}

export interface Lesson {
  id: string;
  chapterNumber: number;
  code: string;
  courseId?: string;
  course: string;
  title: string;
  subtitle: string;
  readingMinutes: number;
  lastUpdated: string;
  author: string;
  summary: string;
  sections: ArticleSection[];
  mindmap: MindmapNode;
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  resourceLabels?: LessonResourceLabels;
  isCustom?: boolean;
}

export interface UserNote {
  id: string;
  lessonId: string;
  sectionId?: string;
  title: string;
  content: string;
  createdAt: string;
}

export type HighlightColor = 'yellow' | 'amber' | 'green' | 'blue';

export interface HighlightAnchor {
  kind: 'text' | 'formula';
  value: string;
}

export interface TextHighlight {
  id: string;
  lessonId: string;
  sectionId?: string;
  text: string;
  anchors?: HighlightAnchor[];
  color: HighlightColor;
  createdAt: string;
}

export interface PassageComment {
  id: string;
  lessonId: string;
  sectionId?: string;
  quote: string;
  comment: string;
  createdAt: string;
  updatedAt?: string;
}
