import {
  ArticleSection,
  ArticleTable,
  Flashcard,
  MindmapNode,
  QuizOption,
  QuizQuestion,
} from '../types/study';

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function slugifyId(prefix: string, idx: number): string {
  return `${prefix}-${idx + 1}-${Date.now().toString(36).slice(-4)}`;
}

/* ============================================================================
 * 1. Markdown (.md) Lecture Note Parser
 * ==========================================================================*/
export interface ParsedMarkdownLesson {
  title?: string;
  subtitle?: string;
  summary?: string;
  readingMinutes: number;
  sections: ArticleSection[];
}

export function parseMarkdownLesson(rawText: string, chapterNumber = 1): ParsedMarkdownLesson {
  const text = stripBom(rawText).replace(/\r\n/g, '\n').trim();
  if (!text) {
    throw new Error('فایل Markdown خالی است.');
  }

  // Strip optional YAML frontmatter if present
  let body = text;
  let fmTitle: string | undefined;
  let fmSubtitle: string | undefined;
  if (body.startsWith('---\n')) {
    const endIdx = body.indexOf('\n---', 4);
    if (endIdx !== -1) {
      const fm = body.slice(4, endIdx);
      const tMatch = fm.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
      const sMatch = fm.match(/^subtitle:\s*['"]?(.+?)['"]?\s*$/m);
      if (tMatch) fmTitle = tMatch[1].trim();
      if (sMatch) fmSubtitle = sMatch[1].trim();
      body = body.slice(endIdx + 4).trim();
    }
  }

  const lines = body.split('\n');
  let title = fmTitle;
  let introLines: string[] = [];
  const rawSections: { title: string; lines: string[] }[] = [];
  let currentSection: { title: string; lines: string[] } | null = null;
  let inCodeFence = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
    }

    if (!inCodeFence) {
      const h1 = line.match(/^#\s+(.+)$/);
      if (h1 && !title && !currentSection) {
        title = h1[1].trim();
        continue;
      }

      const h2 = line.match(/^##\s+(.+)$/);
      if (h2) {
        if (currentSection) rawSections.push(currentSection);
        currentSection = { title: h2[1].trim(), lines: [] };
        continue;
      }
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (currentSection) {
    rawSections.push(currentSection);
  }

  const introClean = introLines.join('\n').trim();
  const sections: ArticleSection[] = [];

  // If there is substantive intro prose and also H2 sections, either use first paragraph as summary or prepend overview section
  let summary: string | undefined;
  if (introClean) {
    const introParagraphs = introClean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (rawSections.length > 0 && introParagraphs.length === 1 && introParagraphs[0].length < 420 && !introParagraphs[0].includes('```') && !introParagraphs[0].includes('|')) {
      summary = introParagraphs[0].replace(/^>\s?/, '');
    } else if (rawSections.length > 0) {
      sections.push({
        id: slugifyId('md-sec', 0),
        number: `${chapterNumber}.0`,
        title: 'مقدمه و نمای کلی',
        paragraphs: [],
        markdownBody: introClean,
      });
    } else {
      sections.push({
        id: slugifyId('md-sec', 0),
        number: `${chapterNumber}.1`,
        title: title || 'متن جزوه',
        paragraphs: [],
        markdownBody: introClean,
      });
    }
  }

  rawSections.forEach((sec, idx) => {
    const numIndex = sections.length + 1;
    sections.push({
      id: slugifyId('md-sec', idx + 1),
      number: `${chapterNumber}.${numIndex}`,
      title: sec.title,
      paragraphs: [],
      markdownBody: sec.lines.join('\n').trim(),
    });
  });

  if (sections.length === 0) {
    sections.push({
      id: slugifyId('md-sec', 0),
      number: `${chapterNumber}.1`,
      title: title || 'متن جزوه',
      paragraphs: [],
      markdownBody: body,
    });
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(2, Math.round(wordCount / 160));

  return {
    title,
    subtitle: fmSubtitle,
    summary,
    readingMinutes,
    sections,
  };
}

/* ============================================================================
 * 2. Flashcards (.csv) Parser — RFC-4180 headerless 2-column question,answer
 * ==========================================================================*/
function parseCsvRows(raw: string): string[][] {
  const text = stripBom(raw);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"' && field.length === 0) {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.length > 0));
}

export function parseFlashcardsCsv(rawText: string, lessonId: string): Flashcard[] {
  const rows = parseCsvRows(rawText);
  if (rows.length === 0) {
    throw new Error('فایل CSV فاقد ردیف معتبر است.');
  }

  // Detect optional generic header row (e.g. question,answer) while keeping headerless CSV intact
  let startIdx = 0;
  const firstA = (rows[0][0] ?? '').toLowerCase();
  const firstB = (rows[0][1] ?? '').toLowerCase();
  const headerFronts = new Set(['question', 'front', 'prompt', 'سوال', 'پرسش', 'روی کارت']);
  const headerBacks = new Set(['answer', 'back', 'explanation', 'پاسخ', 'جواب', 'پشت کارت']);
  if (headerFronts.has(firstA) && headerBacks.has(firstB)) {
    startIdx = 1;
  }

  const cards: Flashcard[] = [];
  for (let i = startIdx; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.length < 2) continue;
    const front = cols[0];
    // If unquoted extra commas appear in a 2-column CSV, join remaining columns cleanly as answer
    const back = cols.length === 2 ? cols[1] : cols.slice(1).join(', ');
    if (!front || !back) continue;

    cards.push({
      id: `imp-fc-${lessonId}-${i}-${Date.now().toString(36).slice(-4)}`,
      front,
      back,
      category: 'واردشده از CSV',
    });
  }

  if (cards.length === 0) {
    throw new Error('هیچ فلش‌کارت دوستونی (question,answer) در فایل CSV یافت نشد.');
  }

  return cards;
}

/* ============================================================================
 * 3. Quiz (.json) Parser — supports single_choice & multiple_select, ignores hint
 * ==========================================================================*/
export interface ParsedQuizImport {
  title?: string;
  description?: string;
  questions: QuizQuestion[];
}

function normalizeQuizOptions(rawOptions: unknown): QuizOption[] {
  if (Array.isArray(rawOptions)) {
    return rawOptions.map((opt, idx) => {
      const fallbackId = String.fromCharCode(97 + idx); // a, b, c, d...
      if (typeof opt === 'string') {
        return { id: fallbackId, text: opt };
      }
      if (opt && typeof opt === 'object') {
        const rec = opt as Record<string, unknown>;
        const id = String(rec.id ?? rec.key ?? rec.label ?? fallbackId);
        const text = String(rec.text ?? rec.value ?? rec.option ?? rec.content ?? rec.label ?? '');
        const formula = typeof rec.formula === 'string' ? rec.formula : undefined;
        return { id, text, formula };
      }
      return { id: fallbackId, text: String(opt) };
    });
  }

  if (rawOptions && typeof rawOptions === 'object') {
    return Object.entries(rawOptions as Record<string, unknown>).map(([k, v]) => ({
      id: k,
      text: String(v ?? ''),
    }));
  }

  return [];
}

function resolveCorrectOptionIds(rawQ: Record<string, unknown>, options: QuizOption[]): string[] {
  const rawAns =
    rawQ.correctOptionIds ??
    rawQ.correct_answers ??
    rawQ.correct_answer ??
    rawQ.correctAnswers ??
    rawQ.correctAnswer ??
    rawQ.correct_options ??
    rawQ.correct_option ??
    rawQ.answers ??
    rawQ.answer;

  const list = Array.isArray(rawAns) ? rawAns : rawAns !== undefined && rawAns !== null ? [rawAns] : [];
  const resolved = new Set<string>();

  for (const item of list) {
    if (typeof item === 'number') {
      // Try 0-based index first
      if (options[item]) {
        resolved.add(options[item].id);
      } else if (options[item - 1]) {
        resolved.add(options[item - 1].id);
      }
      continue;
    }

    const str = String(item).trim();
    if (!str) continue;

    // 1. Exact ID match (case-insensitive)
    const byId = options.find((o) => o.id.toLowerCase() === str.toLowerCase());
    if (byId) {
      resolved.add(byId.id);
      continue;
    }

    // 2. Exact text match
    const byText = options.find((o) => o.text.trim() === str);
    if (byText) {
      resolved.add(byText.id);
      continue;
    }

    // 3. Numeric string index
    if (/^\d+$/.test(str)) {
      const num = Number(str);
      if (options[num]) {
        resolved.add(options[num].id);
        continue;
      }
    }

    // 4. Letter index A/B/C/D mapping to option position
    if (/^[a-zA-Z]$/.test(str)) {
      const pos = str.toLowerCase().charCodeAt(0) - 97;
      if (options[pos]) {
        resolved.add(options[pos].id);
      }
    }
  }

  // Fallback: check options array for `is_correct` / `correct` boolean flags
  if (resolved.size === 0 && Array.isArray(rawQ.options)) {
    rawQ.options.forEach((opt, idx) => {
      if (opt && typeof opt === 'object') {
        const rec = opt as Record<string, unknown>;
        if (rec.is_correct === true || rec.correct === true || rec.isCorrect === true) {
          if (options[idx]) resolved.add(options[idx].id);
        }
      }
    });
  }

  return Array.from(resolved);
}

export function parseQuizJson(rawText: string): ParsedQuizImport {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(rawText));
  } catch {
    throw new Error('ساختار JSON آزمون نامعتبر است.');
  }

  const root = (Array.isArray(data) ? { questions: data } : data) as Record<string, unknown>;
  const rawQuestions = root?.questions;

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error('آرایه questions در فایل JSON آزمون یافت نشد یا خالی است.');
  }

  const questions: QuizQuestion[] = rawQuestions
    .map((item, idx): QuizQuestion | null => {
      if (!item || typeof item !== 'object') return null;
      const rec = item as Record<string, unknown>;
      // Note: rec.hint is intentionally ignored per specification.

      const options = normalizeQuizOptions(rec.options ?? rec.choices);
      if (options.length === 0) return null;

      const correctOptionIds = resolveCorrectOptionIds(rec, options);
      const rawType = String(rec.type ?? rec.question_type ?? '').toLowerCase();
      const isMulti =
        rawType.includes('multi') ||
        rawType.includes('checkbox') ||
        correctOptionIds.length > 1;

      const prompt = String(
        rec.question ?? rec.prompt ?? rec.stem ?? rec.text ?? rec.title ?? `سوال ${idx + 1}`
      ).trim();

      const explanation = String(
        rec.explanation ?? rec.rationale ?? rec.analysis ?? 'پاسخ صحیح در گزینه‌های مشخص‌شده علامت خورده است.'
      ).trim();

      const promptFormula =
        typeof rec.formula === 'string'
          ? rec.formula
          : typeof rec.promptFormula === 'string'
          ? rec.promptFormula
          : undefined;

      return {
        id: String(rec.id ?? `imp-q-${idx + 1}-${Date.now().toString(36).slice(-4)}`),
        type: isMulti ? 'multi' : 'single',
        prompt,
        promptFormula,
        options,
        correctOptionIds: correctOptionIds.length > 0 ? correctOptionIds : [options[0].id],
        explanation,
      };
    })
    .filter((q): q is QuizQuestion => Boolean(q));

  if (questions.length === 0) {
    throw new Error('هیچ سوال معتبری در فایل آزمون یافت نشد.');
  }

  return {
    title: typeof root.title === 'string' ? root.title.trim() : undefined,
    description: typeof root.description === 'string' ? root.description.trim() : undefined,
    questions,
  };
}

/* ============================================================================
 * 4. Mindmap / Knowledge Tree (.json) Parser
 * Supports { metadata, knowledge_tree, splitting_tree_models } with nested
 * children, subtopics, tables, examples, rules, and formulas.
 * ==========================================================================*/
export interface ParsedMindmapImport {
  title?: string;
  course?: string;
  subtitle?: string;
  root: MindmapNode;
  nodeCount: number;
}

function stringListFromUnknown(val: unknown): string[] {
  if (!val) return [];
  if (typeof val === 'string') return [val.trim()].filter(Boolean);
  if (Array.isArray(val)) {
    return val
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const rec = entry as Record<string, unknown>;
          const label = rec.title ?? rec.name ?? rec.rule ?? rec.case ?? rec.label;
          const desc = rec.description ?? rec.detail ?? rec.text ?? rec.formula ?? rec.value ?? rec.example;
          if (label && desc) return `${String(label)}: ${String(desc)}`;
          if (label) return String(label);
          if (desc) return String(desc);
          return Object.entries(rec)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
            .join(' · ');
        }
        return String(entry ?? '').trim();
      })
      .filter(Boolean);
  }
  if (typeof val === 'object') {
    return Object.entries(val as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`
    );
  }
  return [];
}

function normalizeTablesFromUnknown(rawTables: unknown): ArticleTable[] {
  if (!rawTables) return [];
  const list = Array.isArray(rawTables) ? rawTables : [rawTables];
  const tables: ArticleTable[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    // Case A: { title/caption, headers/columns, rows }
    const rawHeaders = rec.headers ?? rec.columns;
    const rawRows = rec.rows ?? rec.data;
    if (Array.isArray(rawHeaders) && Array.isArray(rawRows)) {
      const headers = rawHeaders.map((h) => String(h ?? ''));
      const rows = rawRows.map((r) => {
        if (Array.isArray(r)) return r.map((c) => String(c ?? ''));
        if (r && typeof r === 'object') {
          const obj = r as Record<string, unknown>;
          return headers.map((h) => String(obj[h] ?? ''));
        }
        return [String(r ?? '')];
      });
      tables.push({
        caption: typeof rec.title === 'string' ? rec.title : typeof rec.caption === 'string' ? rec.caption : undefined,
        headers,
        rows,
      });
      continue;
    }

    // Case B: Array of row objects directly inside rawTables
    if (Array.isArray(rawTables) && rawTables.every((r) => r && typeof r === 'object' && !('rows' in (r as object)))) {
      const allKeys = Array.from(
        new Set(rawTables.flatMap((r) => Object.keys(r as Record<string, unknown>)))
      );
      if (allKeys.length > 0) {
        tables.push({
          headers: allKeys,
          rows: rawTables.map((r) => {
            const obj = r as Record<string, unknown>;
            return allKeys.map((k) => {
              const v = obj[k];
              return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
            });
          }),
        });
      }
      break;
    }
  }

  return tables;
}

function convertUnknownToMindmapNode(
  raw: unknown,
  pathId: string,
  fallbackTitle = 'مفهوم'
): MindmapNode {
  if (typeof raw === 'string') {
    return {
      id: pathId,
      title: raw,
      summary: raw,
    };
  }

  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = String(
    rec.title ?? rec.name ?? rec.topic ?? rec.label ?? rec.model_name ?? rec.criterion ?? fallbackTitle
  ).trim();

  const subtitle =
    typeof rec.subtitle === 'string'
      ? rec.subtitle
      : typeof rec.code === 'string'
      ? rec.code
      : typeof rec.type === 'string'
      ? rec.type
      : typeof rec.category === 'string'
      ? rec.category
      : undefined;

  const rawSummary =
    rec.summary ??
    rec.description ??
    rec.definition ??
    rec.overview ??
    rec.explanation ??
    rec.meaning ??
    rec.note;

  const summary =
    typeof rawSummary === 'string' && rawSummary.trim().length > 0
      ? rawSummary.trim()
      : Array.isArray(rawSummary)
      ? rawSummary.map(String).join(' — ')
      : `بررسی ساختار و جزئیات ${title}`;

  const formulas = [
    ...stringListFromUnknown(rec.formula),
    ...stringListFromUnknown(rec.formulas),
    ...stringListFromUnknown(rec.equation),
    ...stringListFromUnknown(rec.equations),
  ];

  const rules = [
    ...stringListFromUnknown(rec.rules),
    ...stringListFromUnknown(rec.key_rules),
    ...stringListFromUnknown(rec.properties),
    ...stringListFromUnknown(rec.conditions),
    ...stringListFromUnknown(rec.key_points),
  ];

  const examples = [
    ...stringListFromUnknown(rec.examples),
    ...stringListFromUnknown(rec.example),
  ];

  const tables = [
    ...normalizeTablesFromUnknown(rec.tables),
    ...normalizeTablesFromUnknown(rec.table),
    ...normalizeTablesFromUnknown(rec.comparison_table),
  ];

  // Collect nested children from children, subtopics, branches, nodes, items, concepts, criteria
  const childCandidates: unknown[] = [];
  for (const key of ['children', 'subtopics', 'branches', 'nodes', 'concepts', 'items', 'steps', 'methods', 'variants']) {
    const val = rec[key];
    if (Array.isArray(val)) {
      childCandidates.push(...val);
    } else if (val && typeof val === 'object') {
      Object.entries(val as Record<string, unknown>).forEach(([k, v]) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          childCandidates.push({ title: k, ...(v as Record<string, unknown>) });
        } else {
          childCandidates.push({ title: k, summary: String(v ?? '') });
        }
      });
    }
  }

  const children = childCandidates.map((child, idx) =>
    convertUnknownToMindmapNode(child, `${pathId}-${idx}`, `زیرمفهوم ${idx + 1}`)
  );

  return {
    id: String(rec.id ?? pathId),
    title,
    subtitle,
    summary,
    formula: formulas[0],
    formulas: formulas.length > 0 ? formulas : undefined,
    rules: rules.length > 0 ? rules : undefined,
    examples: examples.length > 0 ? examples : undefined,
    tables: tables.length > 0 ? tables : undefined,
    children: children.length > 0 ? children : undefined,
  };
}

function countTreeNodes(node: MindmapNode): number {
  return 1 + (node.children?.reduce((sum, c) => sum + countTreeNodes(c), 0) ?? 0);
}

export function parseMindmapJson(rawText: string): ParsedMindmapImport {
  let data: unknown;
  try {
    data = JSON.parse(stripBom(rawText));
  } catch {
    throw new Error('ساختار JSON مایندمپ نامعتبر است.');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('فایل JSON مایندمپ باید یک آبجکت معتبر باشد.');
  }

  const rec = data as Record<string, unknown>;
  const metadata = (rec.metadata && typeof rec.metadata === 'object'
    ? rec.metadata
    : {}) as Record<string, unknown>;

  const metaTitle =
    typeof metadata.title === 'string'
      ? metadata.title
      : typeof metadata.topic === 'string'
      ? metadata.topic
      : typeof rec.title === 'string'
      ? rec.title
      : undefined;

  const metaCourse =
    typeof metadata.course === 'string'
      ? metadata.course
      : typeof metadata.subject === 'string'
      ? metadata.subject
      : undefined;

  const metaSubtitle =
    typeof metadata.subtitle === 'string'
      ? metadata.subtitle
      : typeof metadata.code === 'string'
      ? metadata.code
      : typeof metadata.chapter === 'string'
      ? metadata.chapter
      : undefined;

  const baseId = `imp-mm-${Date.now().toString(36).slice(-4)}`;
  let root: MindmapNode;

  if (rec.knowledge_tree) {
    if (Array.isArray(rec.knowledge_tree)) {
      root = {
        id: baseId,
        title: metaTitle ?? 'مایندمپ',
        subtitle: metaSubtitle,
        summary:
          typeof metadata.description === 'string'
            ? metadata.description
            : typeof metadata.summary === 'string'
            ? metadata.summary
            : 'ساختار سلسله‌مراتبی مفاهیم و قواعد کلیدی فصل',
        children: rec.knowledge_tree.map((branch, idx) =>
          convertUnknownToMindmapNode(branch, `${baseId}-kt-${idx}`, `شاخه ${idx + 1}`)
        ),
      };
    } else {
      root = convertUnknownToMindmapNode(rec.knowledge_tree, baseId, metaTitle ?? 'مایندمپ');
      if (metaTitle && (!root.title || root.title === 'مفهوم')) {
        root.title = metaTitle;
      }
      if (metaSubtitle && !root.subtitle) {
        root.subtitle = metaSubtitle;
      }
    }
  } else {
    root = convertUnknownToMindmapNode(rec, baseId, metaTitle ?? 'مایندمپ');
  }

  // Attach splitting_tree_models if present
  if (rec.splitting_tree_models) {
    const modelsRaw = rec.splitting_tree_models;
    const modelChildren: MindmapNode[] = Array.isArray(modelsRaw)
      ? modelsRaw.map((m, idx) =>
          convertUnknownToMindmapNode(m, `${baseId}-stm-${idx}`, `مدل ${idx + 1}`)
        )
      : typeof modelsRaw === 'object' && modelsRaw !== null
      ? Object.entries(modelsRaw as Record<string, unknown>).map(([k, v], idx) =>
          convertUnknownToMindmapNode(
            v && typeof v === 'object' && !Array.isArray(v)
              ? { title: k, ...(v as Record<string, unknown>) }
              : { title: k, summary: String(v ?? '') },
            `${baseId}-stm-${idx}`,
            k
          )
        )
      : [];

    if (modelChildren.length > 0) {
      const modelsBranch: MindmapNode = {
        id: `${baseId}-stm-branch`,
        title: 'مدل‌های تفکیک و تصمیم‌گیری (Splitting Models)',
        subtitle: `${modelChildren.length} مدل`,
        summary: 'معیارها، فرمول‌ها و قواعد تفکیک شاخه‌ها در مدل‌های درختی این مبحث.',
        children: modelChildren,
      };
      root.children = [...(root.children ?? []), modelsBranch];
    }
  }

  return {
    title: metaTitle ?? root.title,
    course: metaCourse,
    subtitle: metaSubtitle,
    root,
    nodeCount: countTreeNodes(root),
  };
}

/**
 * Auto-detects whether a dropped .json file is a Quiz JSON or a Mindmap/Knowledge Tree JSON.
 */
export function detectJsonKind(rawText: string): 'quiz' | 'mindmap' | 'unknown' {
  try {
    const parsed = JSON.parse(stripBom(rawText));
    if (Array.isArray(parsed)) {
      if (parsed[0] && typeof parsed[0] === 'object' && ('options' in parsed[0] || 'question' in parsed[0])) {
        return 'quiz';
      }
      return 'mindmap';
    }
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as Record<string, unknown>;
      if (Array.isArray(rec.questions) || typeof rec.total_questions === 'number') {
        return 'quiz';
      }
      if (
        'knowledge_tree' in rec ||
        'splitting_tree_models' in rec ||
        'subtopics' in rec ||
        'children' in rec ||
        'metadata' in rec
      ) {
        return 'mindmap';
      }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
