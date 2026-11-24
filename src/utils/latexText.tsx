import React, { createContext, useContext, useState } from 'react';
import katex from 'katex';
import { Check, Copy, FlaskConical, Lightbulb, Sigma } from 'lucide-react';
import { HighlightColor, TextHighlight } from '../types/study';

/* ============================================================================
 * Highlight & Section Scope Contexts for non-destructive React highlighting
 * ==========================================================================*/
export interface HighlightContextValue {
  highlights: TextHighlight[];
  onClickHighlight: (highlight: TextHighlight, rect: DOMRect) => void;
}

export const HighlightContext = createContext<HighlightContextValue | null>(null);
export const SectionScopeContext = createContext<string | undefined>(undefined);

export const HIGHLIGHT_COLOR_CLASSES: Record<HighlightColor, string> = {
  yellow:
    'bg-[#FEF08A]/85 text-[#0F172A] hover:bg-[#FDE047]/90 dark:bg-[#854D0E]/55 dark:text-[#FEF9C3] dark:hover:bg-[#A16207]/65',
  amber:
    'bg-[#FDE68A]/90 text-[#0F172A] hover:bg-[#FCD34D]/90 dark:bg-[#92400E]/55 dark:text-[#FEF3C7] dark:hover:bg-[#B45309]/65',
  green:
    'bg-[#A7F3D0]/80 text-[#0F172A] hover:bg-[#6EE7B7]/85 dark:bg-[#065F46]/60 dark:text-[#D1FAE5] dark:hover:bg-[#047857]/70',
  blue:
    'bg-[#BAE6FD]/85 text-[#0F172A] hover:bg-[#7DD3FC]/90 dark:bg-[#075985]/60 dark:text-[#E0F2FE] dark:hover:bg-[#0369A1]/70',
};

export const HIGHLIGHT_BLOCK_RING_CLASSES: Record<HighlightColor, string> = {
  yellow: 'ring-1 ring-[#EAB308]/60 dark:ring-[#CA8A04]/70',
  amber: 'ring-1 ring-[#F59E0B]/60 dark:ring-[#D97706]/70',
  green: 'ring-1 ring-[#10B981]/55 dark:ring-[#059669]/70',
  blue: 'ring-1 ring-[#0EA5E9]/55 dark:ring-[#0284C7]/70',
};

export function normalizeFormulaKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function isHighlightInScope(hl: TextHighlight, sectionId?: string): boolean {
  if (!hl.sectionId || !sectionId) return true;
  return hl.sectionId === sectionId;
}

function findMatchingFormulaHighlight(
  formulaKey: string,
  hlCtx: HighlightContextValue | null,
  sectionId?: string
): TextHighlight | undefined {
  if (!hlCtx || hlCtx.highlights.length === 0) return undefined;
  const normalized = normalizeFormulaKey(formulaKey);
  return hlCtx.highlights.find((hl) => {
    if (!isHighlightInScope(hl, sectionId)) return false;
    if (hl.anchors && hl.anchors.length > 0) {
      return hl.anchors.some(
        (a) => a.kind === 'formula' && normalizeFormulaKey(a.value) === normalized
      );
    }
    return normalizeFormulaKey(hl.text) === normalized;
  });
}

/* ============================================================================
 * KaTeX Safe Rendering & Plain Scientific Formula Conversion
 * ==========================================================================*/
function renderKatexSafe(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return tex;
  }
}

const UNICODE_SUPER_MAP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
  '⁺': '+',
  'ᵀ': '\\top',
  'ⁿ': 'n',
};

const UNICODE_SUB_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

/**
 * Converts clean plain-text scientific formulas (like `ΔS_universe = ΔS_system + ΔS_surroundings ≥ 0`,
 * `dU = T dS - P dV`, `S = k_B · ln(Ω)`, `η_Carnot = 1 - (T_C / T_H)`, `T(n) = a · T(n / b) + f(n)`,
 * `A = U · Σ · Vᵀ`) into valid KaTeX LaTeX so subscripts, superscripts, and symbols render cleanly.
 */
function plainScientificToLatex(raw: string): string {
  let expr = raw.trim();

  expr = expr
    .replace(/^\$\$([\s\S]*)\$\$$/, '$1')
    .replace(/^\\\[([\s\S]*)\\\]$/, '$1')
    .replace(/^\\\(([\s\S]*)\\\)$/, '$1')
    .replace(/^\$([\s\S]*)\$$/, '$1')
    .trim();

  const hasExplicitLatex =
    /\\(?:frac|sum|int|sqrt|text|mathrm|mathbf|mathbb|left|right|alpha|beta|gamma|delta|Delta|Sigma|Omega|Theta|eta|sigma|lambda|varepsilon|cdot|times|le|ge|approx|to|Rightarrow|rightleftharpoons|ln|log|sin|cos|exp|lim)\b/.test(
      expr
    );

  if (hasExplicitLatex) {
    return expr
      .replace(/·/g, ' \\cdot ')
      .replace(/≥/g, ' \\ge ')
      .replace(/≤/g, ' \\le ')
      .replace(/≈/g, ' \\approx ')
      .replace(/⇒/g, ' \\Rightarrow ')
      .replace(/→/g, ' \\to ')
      .replace(/⇌/g, ' \\rightleftharpoons ');
  }

  if (/\s+\|\s+/.test(expr)) {
    return expr
      .split(/\s+\|\s+/)
      .map((part) => plainScientificToLatex(part))
      .join(' \\quad\\Big|\\quad ');
  }

  expr = expr.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ᵀⁿ]+/g, (run) => {
    const converted = Array.from(run)
      .map((ch) => UNICODE_SUPER_MAP[ch] ?? ch)
      .join('');
    return `^{${converted}}`;
  });

  expr = expr.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (run) => {
    const converted = Array.from(run)
      .map((ch) => UNICODE_SUB_MAP[ch] ?? ch)
      .join('');
    return `_{${converted}}`;
  });

  expr = expr
    .replace(/ℝ/g, '\\mathbb{R}')
    .replace(/Δ/g, '\\Delta ')
    .replace(/Ω/g, '\\Omega ')
    .replace(/Σ/g, '\\Sigma ')
    .replace(/Θ/g, '\\Theta ')
    .replace(/η/g, '\\eta ')
    .replace(/σ/g, '\\sigma ')
    .replace(/λ/g, '\\lambda ')
    .replace(/ε/g, '\\varepsilon ')
    .replace(/δ/g, '\\delta ')
    .replace(/·/g, ' \\cdot ')
    .replace(/×/g, ' \\times ')
    .replace(/≥/g, ' \\ge ')
    .replace(/≤/g, ' \\le ')
    .replace(/≈/g, ' \\approx ')
    .replace(/⇒/g, ' \\Rightarrow ')
    .replace(/→/g, ' \\to ')
    .replace(/⇌/g, ' \\rightleftharpoons ')
    .replace(/∈/g, ' \\in ')
    .replace(/≪/g, ' \\ll ')
    .replace(/√\(([^)]+)\)/g, '\\sqrt{$1}')
    .replace(/√([A-Za-z0-9_\\]+)/g, '\\sqrt{$1}');

  expr = expr.replace(/\b(where|for|and|if|const)\b/g, '\\text{$1}');
  expr = expr.replace(/\b(ln|log|max|min|exp|sin|cos)\b/g, '\\$1');
  expr = expr.replace(/\^\(([^()]+)\)/g, '^{$1}');
  expr = expr.replace(/_([A-Za-z][A-Za-z0-9]+)/g, (_, sub: string) => `_{\\mathrm{${sub}}}`);
  expr = expr.replace(/_([A-Za-z0-9])/g, '_{$1}');
  expr = expr.replace(/\^([A-Za-z0-9]+)/g, '^{$1}');

  return expr.replace(/\s{2,}/g, ' ').trim();
}

/* ============================================================================
 * Atomic Formula Wrapper — renders KaTeX & wraps atomically in <mark> if highlighted
 * ==========================================================================*/
interface AtomicFormulaProps {
  rawKey: string;
  tex: string;
  displayMode: boolean;
  className?: string;
}

const AtomicFormula: React.FC<AtomicFormulaProps> = ({
  rawKey,
  tex,
  displayMode,
  className = '',
}) => {
  const hlCtx = useContext(HighlightContext);
  const sectionId = useContext(SectionScopeContext);
  const normalizedKey = normalizeFormulaKey(rawKey);
  const matchedHighlight = findMatchingFormulaHighlight(normalizedKey, hlCtx, sectionId);
  const html = renderKatexSafe(tex, displayMode);

  const handleMarkClick = (e: React.MouseEvent<HTMLElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    if (matchedHighlight && hlCtx) {
      e.stopPropagation();
      hlCtx.onClickHighlight(matchedHighlight, e.currentTarget.getBoundingClientRect());
    }
  };

  if (displayMode) {
    const formulaEl = (
      <span
        data-formula-atomic="true"
        data-formula-raw={normalizedKey}
        className={`ltr-isolate block overflow-x-auto text-center ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );

    if (matchedHighlight) {
      return (
        <mark
          data-highlight-id={matchedHighlight.id}
          data-highlight-formula="true"
          title="برای حذف هایلایت فرمول کلیک کنید"
          onClick={handleMarkClick}
          className={`study-highlight study-highlight-formula-block ${HIGHLIGHT_COLOR_CLASSES[matchedHighlight.color]} ${HIGHLIGHT_BLOCK_RING_CLASSES[matchedHighlight.color]}`}
        >
          {formulaEl}
        </mark>
      );
    }

    return formulaEl;
  }

  const inlineEl = (
    <span
      data-formula-atomic="true"
      data-formula-raw={normalizedKey}
      className={`ltr-inline mx-0.5 align-baseline text-[#0F172A] dark:text-[#F1F5F9] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );

  if (matchedHighlight) {
    return (
      <mark
        data-highlight-id={matchedHighlight.id}
        data-highlight-formula="true"
        title="برای حذف هایلایت فرمول کلیک کنید"
        onClick={handleMarkClick}
        className={`study-highlight study-highlight-formula-inline ${HIGHLIGHT_COLOR_CLASSES[matchedHighlight.color]}`}
      >
        {inlineEl}
      </mark>
    );
  }

  return inlineEl;
};

const PLAIN_INLINE_MATH_REGEX =
  /(?:[ΔΩΣΘησλδ][A-Za-z]?|[A-Za-z])(?:_[A-Za-z0-9]+)+(?:\^[A-Za-z0-9()]+|[⁰¹²³⁴⁵⁶⁷⁸⁹ᵀ]+)?|[A-Za-z0-9]+\^(?:\([^)]+\)|[A-Za-z0-9_]+)|[A-Za-zΔΩΣΘησλδ][⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ᵀ]+[A-Za-z]?|[A-Za-zΔΩΣΘησλδ][₀₁₂₃₄₅₆₇₈₉]+/g;

/* ============================================================================
 * Recursive Inline AST Parser (Markdown bold/italic/code + LaTeX + Scientific)
 * Handles **Saccharomyces cerevisiae:**, nested *italic*, inline $LaTeX$, etc.
 * ==========================================================================*/
type InlineAstNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineAstNode[] }
  | { type: 'em'; children: InlineAstNode[] }
  | { type: 'code'; value: string }
  | { type: 'inline-math'; value: string }
  | { type: 'display-math'; value: string }
  | { type: 'sci-math'; value: string };

/**
 * Finds the matching closing delimiter (`***`, `**`, `__`, or `*`) starting at
 * `fromIndex`, safely skipping over escaped characters, inline code spans, and
 * `$...$` / `$$...$$` / `\(...\)` / `\[...\]` LaTeX expressions.
 */
function findClosingMarkdownDelimiter(
  input: string,
  fromIndex: number,
  delim: '***' | '**' | '__' | '*'
): number {
  let i = fromIndex;
  let singleStarCount = 0;

  while (i < input.length) {
    const ch = input[i];

    // Skip escaped char
    if (ch === '\\' && i + 1 < input.length) {
      // Skip \( ... \) and \[ ... \]
      if (input[i + 1] === '(') {
        const end = input.indexOf('\\)', i + 2);
        if (end !== -1) {
          i = end + 2;
          continue;
        }
      }
      if (input[i + 1] === '[') {
        const end = input.indexOf('\\]', i + 2);
        if (end !== -1) {
          i = end + 2;
          continue;
        }
      }
      i += 2;
      continue;
    }

    // Skip inline code span `...`
    if (ch === '`') {
      const end = input.indexOf('`', i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }

    // Skip display/inline LaTeX $...$ or $$...$$
    if (ch === '$') {
      if (input[i + 1] === '$') {
        const end = input.indexOf('$$', i + 2);
        if (end !== -1) {
          i = end + 2;
          continue;
        }
      } else {
        let j = i + 1;
        while (j < input.length && input[j] !== '\n') {
          if (input[j] === '\\') {
            j += 2;
            continue;
          }
          if (input[j] === '$') {
            i = j + 1;
            j = -1;
            break;
          }
          j++;
        }
        if (j === -1) continue;
      }
    }

    if (delim === '***') {
      if (input.startsWith('***', i) && i > fromIndex) {
        return i;
      }
      i++;
      continue;
    }

    if (delim === '**') {
      if (input.startsWith('***', i) && i > fromIndex) {
        // If there is an unclosed single `*` inside the bold span, let the first `*`
        // close the inner italic and the following `**` close the outer bold.
        if (singleStarCount % 2 === 1) {
          return i + 1;
        }
        return i;
      }
      if (input.startsWith('**', i) && i > fromIndex) {
        return i;
      }
      if (ch === '*') {
        singleStarCount++;
      }
      i++;
      continue;
    }

    if (delim === '__') {
      if (input.startsWith('__', i) && i > fromIndex) {
        return i;
      }
      i++;
      continue;
    }

    // Single `*` italic delimiter: skip `**` pairs
    if (ch === '*') {
      if (input[i + 1] === '*') {
        i += 2;
        continue;
      }
      if (i > fromIndex) {
        return i;
      }
    }

    i++;
  }

  return -1;
}

function splitPlainTextWithScientific(text: string): InlineAstNode[] {
  if (!text) return [];
  const nodes: InlineAstNode[] = [];
  let last = 0;
  PLAIN_INLINE_MATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PLAIN_INLINE_MATH_REGEX.exec(text)) !== null) {
    const token = match[0];
    const prevChar = match.index > 0 ? text[match.index - 1] : '';
    const nextChar = text[match.index + token.length] ?? '';
    const isPartOfLongWord = /[A-Za-z0-9]/.test(prevChar) || /[A-Za-z]/.test(nextChar);
    if (isPartOfLongWord) continue;

    if (match.index > last) {
      nodes.push({ type: 'text', value: text.slice(last, match.index) });
    }
    nodes.push({ type: 'sci-math', value: token });
    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push({ type: 'text', value: text.slice(last) });
  }

  return nodes;
}

function parseInlineAst(input: string, allowMarkdown: boolean): InlineAstNode[] {
  const nodes: InlineAstNode[] = [];
  let textBuf = '';
  let i = 0;

  const flushText = () => {
    if (!textBuf) return;
    nodes.push(...splitPlainTextWithScientific(textBuf));
    textBuf = '';
  };

  while (i < input.length) {
    const ch = input[i];

    // Escaped delimiters: \$, \*, \`, \_
    if (ch === '\\' && i + 1 < input.length) {
      const next = input[i + 1];
      if (next === '$' || next === '*' || next === '`' || next === '_') {
        textBuf += next;
        i += 2;
        continue;
      }
      // Display math \[ ... \]
      if (next === '[') {
        const end = input.indexOf('\\]', i + 2);
        if (end !== -1) {
          flushText();
          nodes.push({ type: 'display-math', value: input.slice(i + 2, end).trim() });
          i = end + 2;
          continue;
        }
      }
      // Inline math \( ... \)
      if (next === '(') {
        const end = input.indexOf('\\)', i + 2);
        if (end !== -1) {
          flushText();
          nodes.push({ type: 'inline-math', value: input.slice(i + 2, end).trim() });
          i = end + 2;
          continue;
        }
      }
    }

    // Display math $$ ... $$
    if (ch === '$' && input[i + 1] === '$') {
      const end = input.indexOf('$$', i + 2);
      if (end !== -1 && end > i + 2) {
        flushText();
        nodes.push({ type: 'display-math', value: input.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    // Inline math $ ... $ (single line, non-empty)
    if (ch === '$' && input[i + 1] !== '$') {
      let j = i + 1;
      let found = -1;
      while (j < input.length && input[j] !== '\n') {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input[j] === '$') {
          found = j;
          break;
        }
        j++;
      }
      if (found !== -1 && found > i + 1) {
        const inner = input.slice(i + 1, found).trim();
        if (inner.length > 0) {
          flushText();
          nodes.push({ type: 'inline-math', value: inner });
          i = found + 1;
          continue;
        }
      }
    }

    if (allowMarkdown) {
      // Inline code `...`
      if (ch === '`') {
        const end = input.indexOf('`', i + 1);
        if (end !== -1 && end > i + 1) {
          flushText();
          nodes.push({ type: 'code', value: input.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }

      // Bold + Italic ***...***
      if (input.startsWith('***', i)) {
        const end = findClosingMarkdownDelimiter(input, i + 3, '***');
        if (end !== -1) {
          const inner = input.slice(i + 3, end);
          if (inner.trim().length > 0) {
            flushText();
            nodes.push({
              type: 'strong',
              children: [{ type: 'em', children: parseInlineAst(inner, true) }],
            });
            i = end + 3;
            continue;
          }
        }
      }

      // Bold **...** (works seamlessly next to colons, parentheses, Latin terms, Persian text)
      if (input.startsWith('**', i)) {
        const end = findClosingMarkdownDelimiter(input, i + 2, '**');
        if (end !== -1) {
          const inner = input.slice(i + 2, end);
          if (inner.trim().length > 0) {
            flushText();
            nodes.push({
              type: 'strong',
              children: parseInlineAst(inner, true),
            });
            i = end + 2;
            continue;
          }
        }
      }

      // Alternate bold __...__ (only when not mid-word)
      if (input.startsWith('__', i)) {
        const prev = i > 0 ? input[i - 1] : '';
        if (!/[A-Za-z0-9]/.test(prev)) {
          const end = findClosingMarkdownDelimiter(input, i + 2, '__');
          if (end !== -1) {
            const after = input[end + 2] ?? '';
            const inner = input.slice(i + 2, end);
            if (!/[A-Za-z0-9]/.test(after) && inner.trim().length > 0) {
              flushText();
              nodes.push({
                type: 'strong',
                children: parseInlineAst(inner, true),
              });
              i = end + 2;
              continue;
            }
          }
        }
      }

      // Italic *...* (avoid matching standalone multiplication `a * b`)
      if (ch === '*' && input[i + 1] !== '*' && input[i + 1] !== ' ') {
        const end = findClosingMarkdownDelimiter(input, i + 1, '*');
        if (end !== -1 && input[end - 1] !== ' ') {
          const inner = input.slice(i + 1, end);
          if (inner.trim().length > 0) {
            flushText();
            nodes.push({
              type: 'em',
              children: parseInlineAst(inner, true),
            });
            i = end + 1;
            continue;
          }
        }
      }
    }

    textBuf += ch;
    i++;
  }

  flushText();
  return nodes;
}

/**
 * Strips inline Markdown emphasis syntax (`**...**`, `***...***`, `*...*`, `` `...` ``)
 * for clean plain-text previews in TOC items and search result snippets.
 */
export function stripInlineMarkdown(text: string): string {
  if (!text) return '';
  const ast = parseInlineAst(text, true);
  const flatten = (list: InlineAstNode[]): string =>
    list
      .map((node) => {
        if (node.type === 'text' || node.type === 'code' || node.type === 'sci-math') {
          return node.value;
        }
        if (node.type === 'inline-math' || node.type === 'display-math') {
          return node.value;
        }
        return flatten(node.children);
      })
      .join('');
  return flatten(ast);
}

/* ============================================================================
 * Block-Level Unified Text-Stream Highlighting
 * Matches anchors seamlessly across <strong>, <em>, and plain text boundaries
 * ==========================================================================*/
interface TextInterval {
  start: number;
  end: number;
  hl: TextHighlight;
}

const FORMULA_SENTINEL = '\uE002';

function normalizeWithIndexMap(raw: string): { norm: string; toOrig: number[] } {
  let norm = '';
  const toOrig: number[] = [];
  let prevSpace = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\u00A0' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (!prevSpace) {
        norm += ' ';
        toOrig.push(i);
        prevSpace = true;
      }
    } else {
      norm += ch;
      toOrig.push(i);
      prevSpace = false;
    }
  }
  toOrig.push(raw.length);
  return { norm, toOrig };
}

function collectHighlightIntervals(
  streamText: string,
  highlights: TextHighlight[],
  sectionId: string | undefined
): TextInterval[] {
  if (!highlights || highlights.length === 0 || !streamText) return [];

  const { norm, toOrig } = normalizeWithIndexMap(streamText);

  const needleEntries: { needle: string; hl: TextHighlight }[] = [];
  for (const hl of highlights) {
    if (!isHighlightInScope(hl, sectionId)) continue;
    if (hl.anchors && hl.anchors.length > 0) {
      for (const anchor of hl.anchors) {
        if (anchor.kind === 'text') {
          const clean = anchor.value.replace(/\s+/g, ' ').trim();
          if (clean.length >= 2 && norm.includes(clean)) {
            needleEntries.push({ needle: clean, hl });
          }
        }
      }
    } else {
      const clean = hl.text.replace(/\s+/g, ' ').trim();
      if (clean.length >= 2 && norm.includes(clean)) {
        needleEntries.push({ needle: clean, hl });
      }
    }
  }

  if (needleEntries.length === 0) return [];

  // Prefer longest matches first to avoid partial shadowing
  needleEntries.sort((a, b) => b.needle.length - a.needle.length);

  const intervals: TextInterval[] = [];
  for (const { needle, hl } of needleEntries) {
    let searchFrom = 0;
    while (searchFrom < norm.length) {
      const idx = norm.indexOf(needle, searchFrom);
      if (idx === -1) break;
      const normEnd = idx + needle.length;
      const origStart = toOrig[idx];
      const origEnd = toOrig[normEnd];
      const overlaps = intervals.some((iv) => !(origEnd <= iv.start || origStart >= iv.end));
      if (!overlaps && origEnd > origStart) {
        intervals.push({ start: origStart, end: origEnd, hl });
      }
      searchFrom = normEnd;
    }
  }

  intervals.sort((a, b) => a.start - b.start);
  return intervals;
}

function renderSlicedHighlightedLeaf(
  value: string,
  leafStart: number,
  intervals: TextInterval[],
  onClickHighlight: ((hl: TextHighlight, rect: DOMRect) => void) | undefined,
  keyPrefix: string
): React.ReactNode {
  if (!onClickHighlight || intervals.length === 0 || !value) {
    return value;
  }

  const leafEnd = leafStart + value.length;
  const overlapping = intervals.filter((iv) => iv.end > leafStart && iv.start < leafEnd);
  if (overlapping.length === 0) return value;

  const out: React.ReactNode[] = [];
  let cursor = 0;

  overlapping.forEach((iv, idx) => {
    const localStart = Math.max(0, iv.start - leafStart);
    const localEnd = Math.min(value.length, iv.end - leafStart);

    if (localStart > cursor) {
      out.push(
        <React.Fragment key={`${keyPrefix}-p-${idx}`}>
          {value.slice(cursor, localStart)}
        </React.Fragment>
      );
    }

    out.push(
      <mark
        key={`${keyPrefix}-hl-${iv.hl.id}-${idx}`}
        data-highlight-id={iv.hl.id}
        title="برای حذف هایلایت کلیک کنید"
        onClick={(e) => {
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          e.stopPropagation();
          onClickHighlight(iv.hl, e.currentTarget.getBoundingClientRect());
        }}
        className={`study-highlight px-0.5 py-[1px] ${HIGHLIGHT_COLOR_CLASSES[iv.hl.color]}`}
      >
        {value.slice(localStart, localEnd)}
      </mark>
    );
    cursor = localEnd;
  });

  if (cursor < value.length) {
    out.push(<React.Fragment key={`${keyPrefix}-tail`}>{value.slice(cursor)}</React.Fragment>);
  }

  return out;
}

interface RichMathTextProps {
  text: string;
  className?: string;
  inlineMarkdown?: boolean;
}

/**
 * Renders Persian RTL text seamlessly mixed with isolated LTR KaTeX inline/display formulas,
 * Markdown bold/italic/code, formatted plain-text scientific notation, and persisted text +
 * atomic formula highlights (including highlights spanning across bold/italic/list items).
 */
export const RichMathText: React.FC<RichMathTextProps> = ({
  text,
  className,
  inlineMarkdown = true,
}) => {
  const hlCtx = useContext(HighlightContext);
  const sectionId = useContext(SectionScopeContext);
  if (!text) return null;

  const ast = parseInlineAst(text, inlineMarkdown);

  // Build unified block text stream across plain text, <strong>, and <em> leaves
  let streamText = '';
  const leafOffsets = new Map<InlineAstNode, number>();
  const walkStream = (nodes: InlineAstNode[]) => {
    for (const node of nodes) {
      if (node.type === 'text') {
        leafOffsets.set(node, streamText.length);
        streamText += node.value;
      } else if (node.type === 'strong' || node.type === 'em') {
        walkStream(node.children);
      } else {
        // Formula or code separates prose segments cleanly
        streamText += FORMULA_SENTINEL;
      }
    }
  };
  walkStream(ast);

  const intervals = hlCtx
    ? collectHighlightIntervals(streamText, hlCtx.highlights, sectionId)
    : [];

  const renderAst = (nodes: InlineAstNode[], keyPrefix: string): React.ReactNode[] =>
    nodes.map((node, idx) => {
      const k = `${keyPrefix}-${idx}`;
      switch (node.type) {
        case 'text': {
          const offset = leafOffsets.get(node) ?? 0;
          return (
            <React.Fragment key={k}>
              {renderSlicedHighlightedLeaf(
                node.value,
                offset,
                intervals,
                hlCtx?.onClickHighlight,
                k
              )}
            </React.Fragment>
          );
        }
        case 'strong':
          return (
            <strong key={k} className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
              {renderAst(node.children, `${k}b`)}
            </strong>
          );
        case 'em':
          return (
            <em key={k} className="italic">
              {renderAst(node.children, `${k}i`)}
            </em>
          );
        case 'code':
          return (
            <code
              key={k}
              className="ltr-inline mx-0.5 rounded bg-[#E2E8F0]/70 px-1.5 py-0.5 font-mono text-[0.88em] text-[#0F766E] dark:bg-[#27323E] dark:text-[#5EEAD4]"
            >
              {node.value}
            </code>
          );
        case 'display-math':
          return (
            <span
              key={k}
              className="my-3 block rounded-lg border border-[#0D9488]/20 bg-[#F0FDFA] px-4 py-3 text-[#0F172A] dark:border-[#14B8A6]/25 dark:bg-[#0F2928]/70 dark:text-[#F1F5F9]"
            >
              <AtomicFormula
                rawKey={node.value}
                tex={plainScientificToLatex(node.value)}
                displayMode={true}
              />
            </span>
          );
        case 'inline-math':
        case 'sci-math':
          return (
            <AtomicFormula
              key={k}
              rawKey={node.value}
              tex={plainScientificToLatex(node.value)}
              displayMode={false}
            />
          );
      }
    });

  return <span className={className}>{renderAst(ast, 'n')}</span>;
};

interface FormulaDisplayProps {
  formula: string;
  className?: string;
  inline?: boolean;
}

/**
 * Renders any standalone formula (either explicit LaTeX or plain-text scientific notation)
 * through KaTeX inside an isolated atomic LTR container that supports seamless highlighting.
 */
export const FormulaDisplay: React.FC<FormulaDisplayProps> = ({
  formula,
  className = '',
  inline = false,
}) => {
  const tex = plainScientificToLatex(formula);
  return (
    <AtomicFormula
      rawKey={formula}
      tex={tex}
      displayMode={!inline}
      className={className}
    />
  );
};

const CodeSnippetCard: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] dark:border-[#27323E] dark:bg-[#0F1419]">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 dark:border-[#27323E] dark:bg-[#1C252E]">
        <span className="ltr-inline font-mono text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8]">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#475569] transition-colors hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] dark:text-[#CBD5E1] dark:hover:bg-[#27323E] no-print"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-[#059669]" />
              <span className="text-[#059669]">کپی شد</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>کپی کد</span>
            </>
          )}
        </button>
      </div>
      <pre className="ltr-isolate overflow-x-auto p-4 font-mono text-[13px] leading-6 text-[#0F172A] dark:text-[#E2E8F0]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

export interface MarkdownSubheading {
  id: string;
  title: string;
}

/**
 * Extracts level-3 (`###`) subheadings from a section's Markdown body using the exact
 * same code/math fence skipping rules as MarkdownContent so TOC IDs match DOM IDs 1:1.
 */
export function extractMarkdownSubheadings(
  markdown: string | undefined,
  sectionId: string
): MarkdownSubheading[] {
  if (!markdown) return [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const results: MarkdownSubheading[] = [];
  let i = 0;
  let subIdx = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        i++;
      }
      i++;
      continue;
    }

    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const closing = trimmed.startsWith('$$') ? '$$' : '\\]';
      if (trimmed.length > 4 && trimmed.endsWith(closing)) {
        i++;
        continue;
      }
      i++;
      while (i < lines.length && !lines[i].trim().endsWith(closing)) {
        i++;
      }
      i++;
      continue;
    }

    const match = trimmed.match(/^###\s+(.+)$/);
    if (match) {
      results.push({
        id: `${sectionId}-sub-${subIdx}`,
        title: stripInlineMarkdown(match[1].trim()),
      });
      subIdx++;
    }
    i++;
  }

  return results;
}

interface MarkdownContentProps {
  markdown: string;
}

/**
 * Renders rich Persian RTL Markdown with KaTeX display/inline math, GFM tables,
 * callout blockquotes, headings, lists, and LTR code blocks.
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ markdown }) => {
  const sectionId = useContext(SectionScopeContext);
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let subHeadingIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(<CodeSnippetCard key={`code-${i}`} language={lang} code={codeLines.join('\n')} />);
      continue;
    }

    // Multi-line or single-line display LaTeX block $$ ... $$ or \[ ... \]
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const closing = trimmed.startsWith('$$') ? '$$' : '\\]';
      const openingLen = 2;
      if (trimmed.length > 4 && trimmed.endsWith(closing)) {
        const inner = trimmed.slice(openingLen, -openingLen).trim();
        blocks.push(
          <div
            key={`math-${i}`}
            className="my-4 rounded-xl border border-[#0D9488]/20 bg-[#F0FDFA] px-5 py-4 text-[#0F172A] dark:border-[#14B8A6]/25 dark:bg-[#0F2928]/70 dark:text-[#F1F5F9]"
          >
            <AtomicFormula rawKey={inner} tex={inner} displayMode={true} />
          </div>
        );
        i++;
        continue;
      }

      const mathLines: string[] = [trimmed.slice(openingLen)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith(closing)) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        const lastLine = lines[i].trim();
        const withoutEnd = lastLine.slice(0, -closing.length);
        if (withoutEnd) mathLines.push(withoutEnd);
        i++;
      }
      const inner = mathLines.join('\n').trim();
      blocks.push(
        <div
          key={`math-ml-${i}`}
          className="my-4 rounded-xl border border-[#0D9488]/20 bg-[#F0FDFA] px-5 py-4 text-[#0F172A] dark:border-[#14B8A6]/25 dark:bg-[#0F2928]/70 dark:text-[#F1F5F9]"
        >
          <AtomicFormula rawKey={inner} tex={inner} displayMode={true} />
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} className="my-6 border-[#E2E8F0] dark:border-[#27323E]" />);
      i++;
      continue;
    }

    // Subheadings (### or ####)
    const headingMatch = trimmed.match(/^(#{3,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (level === 3) {
        const subId = sectionId ? `${sectionId}-sub-${subHeadingIdx}` : undefined;
        subHeadingIdx++;
        blocks.push(
          <h3
            key={`h3-${i}`}
            id={subId}
            className="mt-6 mb-2 scroll-mt-28 text-lg font-semibold leading-8 text-[#0F172A] dark:text-[#F8FAFC]"
          >
            <RichMathText text={text} />
          </h3>
        );
      } else {
        blocks.push(
          <h4
            key={`h4-${i}`}
            className="mt-5 mb-2 text-base font-semibold leading-7 text-[#1E293B] dark:text-[#E2E8F0]"
          >
            <RichMathText text={text} />
          </h4>
        );
      }
      i++;
      continue;
    }

    // GFM Table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <div
          key={`tbl-${i}`}
          className="my-5 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white dark:border-[#27323E] dark:bg-[#1C252E]"
        >
          <table className="w-full border-collapse text-right text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] dark:border-[#27323E] dark:bg-[#161D24]">
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className="px-4 py-3 text-xs font-semibold text-[#475569] dark:text-[#94A3B8]"
                  >
                    <RichMathText text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27323E]">
              {rows.map((r, rIdx) => (
                <tr key={rIdx} className="hover:bg-[#F8FAFC]/80 dark:hover:bg-[#24303C]/50">
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-4 py-3 text-[13px] leading-6 text-[#1E293B] dark:text-[#E2E8F0]"
                    >
                      <RichMathText text={r[cIdx] ?? ''} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote / Archival Callout
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const joined = quoteLines.join('\n');
      const isExample = /مثال|example/i.test(quoteLines[0] ?? '');
      const isFormula = /فرمول|قضیه|رابطه|formula/i.test(quoteLines[0] ?? '');
      const Icon = isFormula ? Sigma : isExample ? FlaskConical : Lightbulb;
      const boxStyle = isExample
        ? 'border-[#E2E8F0] border-r-[#475569] bg-[#F8FAFC] dark:border-[#27323E] dark:border-r-[#64748B] dark:bg-[#1C252E]'
        : 'border-[#99F6E4]/70 border-r-[#0D9488] bg-[#F0FDFA] dark:border-[#134E4A] dark:border-r-[#14B8A6] dark:bg-[#0F2928]/70';

      blocks.push(
        <blockquote
          key={`bq-${i}`}
          className={`my-4 rounded-xl border border-r-4 p-4 sm:p-5 ${boxStyle}`}
        >
          <div className="flex items-start gap-2.5">
            <Icon className="mt-1 h-4 w-4 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
            <div className="min-w-0 flex-1 space-y-2 text-[0.95em] leading-[1.95] text-[#1E293B] dark:text-[#E2E8F0]">
              {joined.split('\n').map((qLine, qIdx) => (
                <p key={qIdx}>
                  <RichMathText text={qLine} />
                </p>
              ))}
            </div>
          </div>
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, '').trim());
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-3 space-y-2 pr-1">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 leading-[1.95] text-[#1E293B] dark:text-[#CBD5E1]"
            >
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0D9488]" />
              <span className="min-w-0 flex-1">
                <RichMathText text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '').trim());
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-3 list-decimal space-y-2 pr-5 marker:font-mono marker:text-[#0D9488]">
          {items.map((item, idx) => (
            <li key={idx} className="leading-[1.95] text-[#1E293B] dark:text-[#CBD5E1]">
              <RichMathText text={item} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('$$') &&
      !lines[i].trim().startsWith('\\[') &&
      !lines[i].trim().startsWith('>') &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push(
        <p key={`p-${i}`} className="lecture-paragraph leading-[2.0] text-[#1E293B] dark:text-[#CBD5E1]">
          <RichMathText text={paraLines.join(' ')} />
        </p>
      );
    } else {
      i++;
    }
  }

  return <div className="space-y-4">{blocks}</div>;
};
