import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronDown,
  Maximize2,
  Minimize2,
  PlusCircle,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  GitBranch,
  ListTree,
  Check,
} from 'lucide-react';
import { Lesson, MindmapNode } from '../types/study';
import { FormulaDisplay, RichMathText } from '../utils/latexText';
import { isMindmapEmpty } from './ResourceManagerWorkspace';

interface MindmapWorkspaceProps {
  lesson: Lesson;
  onJumpToSection: (sectionId: string) => void;
  onCreateFlashcardFromNode: (node: MindmapNode) => void;
  onOpenResources?: () => void;
}

function collectAllIds(node: MindmapNode): string[] {
  const ids = [node.id];
  if (node.children) {
    for (const child of node.children) {
      ids.push(...collectAllIds(child));
    }
  }
  return ids;
}

function countDescendants(node: MindmapNode): number {
  if (!node.children || node.children.length === 0) return 0;
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}

interface PositionedNode {
  node: MindmapNode;
  x: number;
  y: number;
  depth: number;
  parentX?: number;
  parentY?: number;
}

function computeGraphLayout(root: MindmapNode): { nodes: PositionedNode[]; width: number; height: number } {
  // General recursive RTL horizontal tree layout (root on right, deeper levels extending left)
  let maxDepth = 0;
  const measureDepth = (n: MindmapNode, d: number) => {
    if (d > maxDepth) maxDepth = d;
    n.children?.forEach((c) => measureDepth(c, d + 1));
  };
  measureDepth(root, 0);

  const colSpacing = 240;
  const rightPadding = 130;
  const leftPadding = 130;
  const width = Math.max(840, rightPadding + leftPadding + maxDepth * colSpacing);
  const xForDepth = (depth: number) => width - rightPadding - depth * colSpacing;

  const nodes: PositionedNode[] = [];
  let cursorY = 70;
  const leafSpacing = 84;
  const branchGap = 20;

  const placeNode = (
    node: MindmapNode,
    depth: number,
    parentPos?: { x: number; y: number }
  ): number => {
    const x = xForDepth(depth);
    const children = node.children ?? [];

    if (children.length === 0) {
      const y = cursorY;
      cursorY += leafSpacing;
      nodes.push({
        node,
        x,
        y,
        depth,
        parentX: parentPos?.x,
        parentY: parentPos?.y,
      });
      return y;
    }

    const startIndex = nodes.length;
    const childYs: number[] = [];
    for (const child of children) {
      const cy = placeNode(child, depth + 1, { x, y: 0 });
      childYs.push(cy);
    }
    cursorY += branchGap;

    const y = (childYs[0] + childYs[childYs.length - 1]) / 2;

    // Patch immediate children's parentY now that we know our centered y
    for (let i = startIndex; i < nodes.length; i++) {
      if (nodes[i].depth === depth + 1 && nodes[i].parentX === x) {
        nodes[i].parentY = y;
      }
    }

    nodes.push({
      node,
      x,
      y,
      depth,
      parentX: parentPos?.x,
      parentY: parentPos?.y,
    });

    return y;
  };

  placeNode(root, 0);
  const totalHeight = Math.max(420, cursorY + 40);
  return { nodes, width, height: totalHeight };
}

export const MindmapWorkspace: React.FC<MindmapWorkspaceProps> = ({
  lesson,
  onJumpToSection,
  onCreateFlashcardFromNode,
  onOpenResources,
}) => {
  const [viewType, setViewType] = useState<'tree' | 'graph'>('tree');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(collectAllIds(lesson.mindmap)));
  const [selectedNode, setSelectedNode] = useState<MindmapNode>(lesson.mindmap);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [addedCardNodeId, setAddedCardNodeId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedIds(new Set(collectAllIds(lesson.mindmap)));
    setSelectedNode(lesson.mindmap);
    setQuery('');
    setZoom(1);
  }, [lesson.id, lesson.mindmap]);

  const allIds = useMemo(() => collectAllIds(lesson.mindmap), [lesson.mindmap]);
  const graphLayout = useMemo(() => computeGraphLayout(lesson.mindmap), [lesson.mindmap]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(allIds));
  const collapseAll = () => setExpandedIds(new Set([lesson.mindmap.id]));

  const normalizedQuery = query.trim().toLowerCase();

  const matchesNode = (node: MindmapNode): boolean => {
    if (!normalizedQuery) return true;
    return (
      node.title.toLowerCase().includes(normalizedQuery) ||
      node.summary.toLowerCase().includes(normalizedQuery) ||
      (node.formula?.toLowerCase().includes(normalizedQuery) ?? false)
    );
  };

  const handleAddCard = (node: MindmapNode) => {
    onCreateFlashcardFromNode(node);
    setAddedCardNodeId(node.id);
    setTimeout(() => setAddedCardNodeId((cur) => (cur === node.id ? null : cur)), 2000);
  };

  const renderTreeNode = (node: MindmapNode, depth = 0) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedNode.id === node.id;
    const subCount = countDescendants(node);
    const isMatch = normalizedQuery.length > 0 && matchesNode(node);

    return (
      <div key={node.id} className={depth > 0 ? 'mr-5 border-r border-[#CBD5E1] pr-4 dark:border-[#364554] sm:mr-7 sm:pr-5' : ''}>
        <div
          onClick={() => setSelectedNode(node)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedNode(node);
            }
          }}
          className={`group mb-2.5 flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-all duration-150 ${
            isSelected
              ? 'elevation-tier-2 border-[#0D9488] bg-[#F0FDFA] dark:border-[#14B8A6] dark:bg-[#0F2928]/70'
              : isMatch
              ? 'border-[#FCD34D] bg-[#FFFBEB] dark:border-[#B45309] dark:bg-[#451A03]/30'
              : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:shadow-xs dark:border-[#27323E] dark:bg-[#1C252E] dark:hover:border-[#364554]'
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-sm font-semibold ${
                  isSelected
                    ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                    : 'text-[#0F172A] dark:text-[#F1F5F9]'
                }`}
              >
                <RichMathText text={node.title} inlineMarkdown={false} />
              </span>
              {node.subtitle && (
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  · <RichMathText text={node.subtitle} inlineMarkdown={false} />
                </span>
              )}
              {node.formula && (
                <span className="rounded bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-medium text-[#0F766E] dark:bg-[#0F2928] dark:text-[#2DD4BF]">
                  <FormulaDisplay formula={node.formula} inline />
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
              <RichMathText text={node.summary} />
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {subCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums transition-colors ${
                  isSelected
                    ? 'bg-[#0D9488] text-white'
                    : 'bg-[#F1F5F9] text-[#475569] group-hover:bg-[#CCFBF1] group-hover:text-[#0F766E] dark:bg-[#27323E] dark:text-[#CBD5E1] dark:group-hover:bg-[#134E4A] dark:group-hover:text-[#5EEAD4]'
                }`}
              >
                {subCount} زیرمفهوم
              </span>
            )}

            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                aria-label={isExpanded ? 'بستن شاخه' : 'باز کردن شاخه'}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E]"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isMindmapEmpty(lesson.mindmap)) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-6 lg:px-10">
        <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E2E8F0] bg-[#FAF9F6] p-8 text-center dark:border-[#27323E] dark:bg-[#161D24]">
          <GitBranch className="mx-auto h-9 w-9 text-[#94A3B8]" />
          <h2 className="mt-3 text-base font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            درخت دانشی برای «{lesson.title}» ثبت نشده است
          </h2>
          <p className="mt-2 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
            برای مشاهده نقشه مفهومی و درخت دانش، فایل JSON مایندمپ این درس را از بخش مدیریت منابع بارگذاری کنید.
          </p>
          {onOpenResources && (
            <button
              type="button"
              onClick={onOpenResources}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
            >
              <span>افزودن درخت دانش در مدیریت منابع</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-6 lg:px-10 lg:py-8">
      {/* Toolbar Header */}
      <div className="mb-5 flex flex-col justify-between gap-4 rounded-xl border border-[#E2E8F0] bg-[#FAF9F6] p-4 dark:border-[#27323E] dark:bg-[#161D24] md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <span className="ltr-inline font-mono font-medium text-[#0F766E] dark:text-[#2DD4BF]">
              {lesson.code}
            </span>
            <span aria-hidden="true">·</span>
            <span>نقشه مفهومی و درخت دانش فصل {lesson.chapterNumber}</span>
          </div>
          <h1 className="mt-1 text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC]">
            {lesson.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg bg-[#E2E8F0] p-1 dark:bg-[#1E293B]">
            <button
              type="button"
              onClick={() => setViewType('tree')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                viewType === 'tree'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
              }`}
            >
              <ListTree className="h-3.5 w-3.5" />
              <span>نمای درختی</span>
            </button>
            <button
              type="button"
              onClick={() => setViewType('graph')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                viewType === 'graph'
                  ? 'border border-[#CBD5E1] bg-white font-semibold text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#2DD4BF]'
                  : 'font-medium text-[#64748B] hover:text-[#1E293B] dark:text-[#94A3B8]'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>نمای گرافیکی</span>
            </button>
          </div>

          {viewType === 'tree' ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="فیلتر مفاهیم..."
                  className="archival-input w-[170px] border border-[#CBD5E1] bg-white pr-8 text-xs text-[#0F172A] placeholder:text-[#94A3B8] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#F1F5F9]"
                />
              </div>
              <button
                type="button"
                onClick={expandAll}
                className="flex h-[42px] items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>باز کردن همه</span>
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="flex h-[42px] items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-medium text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1]"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>بستن</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white p-1 dark:border-[#364554] dark:bg-[#1C252E]">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
                aria-label="کوچک‌نمایی"
                className="flex h-8 w-8 items-center justify-center rounded text-[#475569] hover:bg-[#F1F5F9] dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="ltr-inline min-w-[44px] text-center font-mono text-xs font-medium text-[#334155] tabular-nums dark:text-[#CBD5E1]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.45, +(z + 0.15).toFixed(2)))}
                aria-label="بزرگ‌نمایی"
                className="flex h-8 w-8 items-center justify-center rounded text-[#475569] hover:bg-[#F1F5F9] dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="بازنشانی مقیاس"
                className="flex h-8 w-8 items-center justify-center rounded text-[#475569] hover:bg-[#F1F5F9] dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Split Pane: Interactive Canvas + Concept Inspector */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left/Right Main Mindmap Pane */}
        <div className="elevation-tier-1 rounded-2xl bg-[#FAF9F6] p-5 dark:bg-[#161D24] sm:p-6">
          {viewType === 'tree' ? (
            <div>{renderTreeNode(lesson.mindmap, 0)}</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] dark:border-[#27323E] dark:bg-[#0F1419]">
              <div
                className="min-w-[780px] p-4 transition-transform duration-150"
                style={{
                  backgroundImage:
                    'radial-gradient(rgba(148, 163, 184, 0.25) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              >
                <svg
                  viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
                  className="mx-auto h-auto w-full origin-center transition-transform duration-150"
                  style={{ transform: `scale(${zoom})` }}
                  role="img"
                  aria-label={`نقشه مفهومی ${lesson.title}`}
                >
                  {/* Cubic Bezier Connectors */}
                  {graphLayout.nodes
                    .filter((item) => item.parentX !== undefined && item.parentY !== undefined)
                    .map((item) => {
                      const midX = (item.x + item.parentX!) / 2;
                      const isActiveEdge = selectedNode.id === item.node.id;
                      return (
                        <path
                          key={`edge-${item.node.id}`}
                          d={`M ${item.parentX} ${item.parentY} C ${midX} ${item.parentY}, ${midX} ${item.y}, ${item.x} ${item.y}`}
                          fill="none"
                          stroke={isActiveEdge ? '#0D9488' : '#CBD5E1'}
                          strokeWidth={isActiveEdge ? 2.2 : 1.4}
                          className="dark:stroke-[#364554]"
                        />
                      );
                    })}

                  {/* Concept Nodes */}
                  {graphLayout.nodes.map((item) => {
                    const isSelected = selectedNode.id === item.node.id;
                    const boxW = item.depth === 0 ? 185 : item.depth === 1 ? 175 : 175;
                    const boxH = item.node.formula ? 58 : 48;
                    const rx = item.x - boxW / 2;
                    const ry = item.y - boxH / 2;

                    return (
                      <g
                        key={item.node.id}
                        onClick={() => setSelectedNode(item.node)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={rx}
                          y={ry}
                          width={boxW}
                          height={boxH}
                          rx={10}
                          fill={
                            isSelected
                              ? '#0D9488'
                              : item.depth === 0
                              ? '#F0FDFA'
                              : '#FFFFFF'
                          }
                          stroke={isSelected ? '#0F766E' : item.depth === 0 ? '#0D9488' : '#CBD5E1'}
                          strokeWidth={isSelected ? 2 : 1.2}
                        />
                        <text
                          x={item.x}
                          y={item.node.formula ? item.y - 6 : item.y + 4}
                          textAnchor="middle"
                          fontSize={item.depth === 0 ? 12.5 : 11.5}
                          fontWeight={600}
                          fill={isSelected ? '#FFFFFF' : '#0F172A'}
                          style={{ fontFamily: 'Vazirmatn, sans-serif' }}
                        >
                          {item.node.title.length > 24
                            ? `${item.node.title.slice(0, 23)}…`
                            : item.node.title}
                        </text>
                        {item.node.formula && (
                          <text
                            x={item.x}
                            y={item.y + 15}
                            textAnchor="middle"
                            fontSize={10}
                            fill={isSelected ? '#CCFBF1' : '#0F766E'}
                            style={{ fontFamily: 'IBM Plex Mono, monospace' }}
                          >
                            {item.node.formula.length > 22
                              ? `${item.node.formula.slice(0, 21)}…`
                              : item.node.formula}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Side Concept Inspector Panel */}
        <aside className="elevation-tier-2 sticky top-[84px] max-h-[calc(100vh-110px)] overflow-y-auto rounded-2xl bg-white p-5 dark:bg-[#1C252E]">
          <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3 dark:border-[#27323E]">
            <span className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
              بازرس مفهوم انتخاب‌شده
            </span>
            {selectedNode.subtitle && (
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {selectedNode.subtitle}
              </span>
            )}
          </div>

          <h2 className="mt-4 text-lg font-bold leading-7 text-[#0F172A] dark:text-[#F8FAFC]">
            <RichMathText text={selectedNode.title} inlineMarkdown={false} />
          </h2>

          <p className="mt-2.5 text-sm leading-7 text-[#334155] dark:text-[#CBD5E1]">
            <RichMathText text={selectedNode.summary} />
          </p>

          {(selectedNode.formulas && selectedNode.formulas.length > 0
            ? selectedNode.formulas
            : selectedNode.formula
            ? [selectedNode.formula]
            : []
          ).length > 0 && (
            <div className="mt-4 space-y-2">
              <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                فرمول مرتبط
              </span>
              {(selectedNode.formulas && selectedNode.formulas.length > 0
                ? selectedNode.formulas
                : [selectedNode.formula!]
              ).map((f, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-[#0D9488]/25 bg-[#F0FDFA] px-3.5 py-2.5 text-xs font-semibold text-[#0F172A] dark:border-[#14B8A6]/30 dark:bg-[#0F2928] dark:text-[#F1F5F9]"
                >
                  <FormulaDisplay formula={f} />
                </div>
              ))}
            </div>
          )}

          {selectedNode.rules && selectedNode.rules.length > 0 && (
            <div className="mt-4 border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
              <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                قواعد و نکات کلیدی ({selectedNode.rules.length})
              </span>
              <ul className="mt-2 space-y-1.5 text-xs leading-6 text-[#334155] dark:text-[#CBD5E1]">
                {selectedNode.rules.map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0D9488]" />
                    <span className="min-w-0 flex-1">
                      <RichMathText text={rule} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedNode.examples && selectedNode.examples.length > 0 && (
            <div className="mt-4 border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
              <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                مثال‌های کاربردی
              </span>
              <div className="mt-2 space-y-2">
                {selectedNode.examples.map((ex, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[#E2E8F0] border-r-4 border-r-[#475569] bg-[#F8FAFC] p-2.5 text-xs leading-6 text-[#334155] dark:border-[#27323E] dark:border-r-[#64748B] dark:bg-[#161D24] dark:text-[#CBD5E1]"
                  >
                    <RichMathText text={ex} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedNode.tables && selectedNode.tables.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
              {selectedNode.tables.map((tbl, tIdx) => (
                <div key={tIdx}>
                  {tbl.caption && (
                    <p className="mb-1.5 text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                      {tbl.caption}
                    </p>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] dark:border-[#27323E]">
                    <table className="w-full border-collapse text-right text-[11px]">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] dark:border-[#27323E] dark:bg-[#161D24]">
                          {tbl.headers.map((h, hIdx) => (
                            <th key={hIdx} className="px-2.5 py-2 font-semibold text-[#475569] dark:text-[#94A3B8]">
                              <RichMathText text={h} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27323E]">
                        {tbl.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="px-2.5 py-2 text-[#1E293B] dark:text-[#E2E8F0]">
                                <RichMathText text={cell} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedNode.children && selectedNode.children.length > 0 && (
            <div className="mt-5 border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
              <span className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                زیرشاخه‌های مستقیم ({selectedNode.children.length})
              </span>
              <div className="mt-2 space-y-1.5">
                {selectedNode.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedNode(child)}
                    className="flex w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#FAF9F6] px-3 py-2 text-right text-xs font-medium text-[#1E293B] transition-colors hover:border-[#0D9488] hover:text-[#0F766E] dark:border-[#27323E] dark:bg-[#161D24] dark:text-[#E2E8F0]"
                  >
                    <span>{child.title}</span>
                    <ChevronLeft className="h-3.5 w-3.5 text-[#94A3B8]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-2.5 border-t border-[#E2E8F0] pt-4 dark:border-[#27323E]">
            {selectedNode.sectionId && (
              <button
                type="button"
                onClick={() => onJumpToSection(selectedNode.sectionId!)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0D9488] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <BookOpen className="h-4 w-4" />
                <span>مطالعه بخش مرتبط در جزوه</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleAddCard(selectedNode)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2.5 text-xs font-semibold text-[#1E293B] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#E2E8F0]"
            >
              {addedCardNodeId === selectedNode.id ? (
                <>
                  <Check className="h-4 w-4 text-[#059669]" />
                  <span className="text-[#059669]">به دسته فلش‌کارت اضافه شد</span>
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4" />
                  <span>ساخت فلش‌کارت از این مفهوم</span>
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
