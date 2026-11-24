import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronDown,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  GitBranch,
  ListTree,
  FileUp,
  Move,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Lesson, MindmapNode } from '../types/study';
import { FormulaDisplay, RichMathText } from '../utils/latexText';
import { isMindmapEmpty } from './ResourceManagerWorkspace';
import { HoverTooltip } from './ui/HoverTooltip';

interface MindmapWorkspaceProps {
  lesson: Lesson;
  onJumpToSection: (sectionId: string) => void;
  onUpdateMindmap?: (nextRoot: MindmapNode) => void;
  focusNodeId?: string | null;
  onClearFocusNode?: () => void;
  onOpenImportModal?: () => void;
  onOpenResources?: () => void;
}

function findNodeById(root: MindmapNode, targetId: string): MindmapNode | null {
  if (root.id === targetId) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, targetId);
      if (found) return found;
    }
  }
  return null;
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

function collectDefaultGraphExpandedIds(root: MindmapNode): string[] {
  // Expand root and primary branches by default so the centered map opens clean & balanced
  const ids = [root.id];
  if (root.children) {
    for (const child of root.children) {
      ids.push(child.id);
    }
  }
  return ids;
}

function countDescendants(node: MindmapNode): number {
  if (!node.children || node.children.length === 0) return 0;
  return node.children.reduce((acc, c) => acc + 1 + countDescendants(c), 0);
}

function updateNodeInTree(
  root: MindmapNode,
  targetId: string,
  updates: Partial<Pick<MindmapNode, 'title' | 'subtitle' | 'summary' | 'formula'>>
): MindmapNode {
  if (root.id === targetId) {
    return {
      ...root,
      ...updates,
    };
  }
  if (!root.children) return root;
  return {
    ...root,
    children: root.children.map((child) => updateNodeInTree(child, targetId, updates)),
  };
}

function addChildToTree(
  root: MindmapNode,
  parentId: string,
  newChild: MindmapNode
): MindmapNode {
  if (root.id === parentId) {
    return {
      ...root,
      children: [...(root.children ?? []), newChild],
    };
  }
  if (!root.children) return root;
  return {
    ...root,
    children: root.children.map((child) => addChildToTree(child, parentId, newChild)),
  };
}

function deleteNodeFromTree(root: MindmapNode, targetId: string): MindmapNode {
  if (!root.children) return root;
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== targetId)
      .map((child) => deleteNodeFromTree(child, targetId)),
  };
}

const BRANCH_ACCENTS = [
  '#0D9488', // Teal
  '#0284C7', // Sky
  '#D97706', // Amber
  '#059669', // Emerald
  '#4F46E5', // Indigo
  '#E11D48', // Rose
];

interface PositionedNode {
  node: MindmapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  side: 'center' | 'right' | 'left';
  accent: string;
  hasChildren: boolean;
  isExpanded: boolean;
  descendantCount: number;
  parentX?: number;
  parentY?: number;
  parentWidth?: number;
}

/**
 * Centered Bidirectional Radial Mind Map Layout:
 * Places the root node in the exact center and radiates primary branches outward
 * to both the right and left sides. Respects per-node expand/collapse state so
 * users can explore deep hierarchies cleanly without overlap.
 */
function computeCenteredGraphLayout(
  root: MindmapNode,
  expandedIds: Set<string>
): { nodes: PositionedNode[]; width: number; height: number; centerX: number; centerY: number } {
  const colSpacing = 248;
  const nodeSpacingY = 82;
  const branchGapY = 18;

  const getBoxSize = (node: MindmapNode, depth: number) => ({
    w: depth === 0 ? 204 : depth === 1 ? 182 : 172,
    h: node.formula ? 58 : 48,
  });

  const getVisibleChildren = (node: MindmapNode): MindmapNode[] => {
    if (!node.children || node.children.length === 0) return [];
    if (!expandedIds.has(node.id)) return [];
    return node.children;
  };

  const measureSubtreeHeight = (node: MindmapNode): number => {
    const visible = getVisibleChildren(node);
    if (visible.length === 0) return nodeSpacingY;
    let sum = 0;
    for (const child of visible) {
      sum += measureSubtreeHeight(child);
    }
    return Math.max(nodeSpacingY, sum + (visible.length - 1) * branchGapY);
  };

  const measureSideMaxDepth = (branches: MindmapNode[], depth: number): number => {
    let maxD = 0;
    for (const b of branches) {
      maxD = Math.max(maxD, depth);
      const visible = getVisibleChildren(b);
      if (visible.length > 0) {
        maxD = Math.max(maxD, measureSideMaxDepth(visible, depth + 1));
      }
    }
    return maxD;
  };

  const visibleRootChildren = getVisibleChildren(root);
  const splitIdx = Math.ceil(visibleRootChildren.length / 2);
  const rightBranches = visibleRootChildren.slice(0, splitIdx);
  const leftBranches = visibleRootChildren.slice(splitIdx);

  const rightMaxDepth = measureSideMaxDepth(rightBranches, 1);
  const leftMaxDepth = measureSideMaxDepth(leftBranches, 1);

  const rightTotalH =
    rightBranches.reduce((acc, b) => acc + measureSubtreeHeight(b), 0) +
    Math.max(0, rightBranches.length - 1) * branchGapY;
  const leftTotalH =
    leftBranches.reduce((acc, b) => acc + measureSubtreeHeight(b), 0) +
    Math.max(0, leftBranches.length - 1) * branchGapY;

  const padX = 160;
  const padY = 80;
  const leftSpan = Math.max(1, leftMaxDepth) * colSpacing + padX;
  const rightSpan = Math.max(1, rightMaxDepth) * colSpacing + padX;
  const width = Math.max(920, leftSpan + rightSpan);
  const centerX = Math.max(leftSpan, width / 2);
  const height = Math.max(520, Math.max(rightTotalH, leftTotalH) + padY * 2);
  const centerY = height / 2;

  const nodes: PositionedNode[] = [];
  const rootSize = getBoxSize(root, 0);

  nodes.push({
    node: root,
    x: centerX,
    y: centerY,
    width: rootSize.w,
    height: rootSize.h,
    depth: 0,
    side: 'center',
    accent: '#0D9488',
    hasChildren: Boolean(root.children && root.children.length > 0),
    isExpanded: expandedIds.has(root.id),
    descendantCount: countDescendants(root),
  });

  const placeSubtree = (
    node: MindmapNode,
    depth: number,
    side: 'right' | 'left',
    topY: number,
    accent: string,
    parent: { x: number; y: number; width: number }
  ) => {
    const subH = measureSubtreeHeight(node);
    const y = topY + subH / 2;
    const x = side === 'right' ? centerX + depth * colSpacing : centerX - depth * colSpacing;
    const size = getBoxSize(node, depth);
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = expandedIds.has(node.id);

    nodes.push({
      node,
      x,
      y,
      width: size.w,
      height: size.h,
      depth,
      side,
      accent,
      hasChildren,
      isExpanded,
      descendantCount: countDescendants(node),
      parentX: parent.x,
      parentY: parent.y,
      parentWidth: parent.width,
    });

    const visible = getVisibleChildren(node);
    if (visible.length === 0) return;

    const childrenTotalH =
      visible.reduce((acc, c) => acc + measureSubtreeHeight(c), 0) +
      Math.max(0, visible.length - 1) * branchGapY;
    let cursorY = y - childrenTotalH / 2;

    for (const child of visible) {
      const childH = measureSubtreeHeight(child);
      placeSubtree(child, depth + 1, side, cursorY, accent, { x, y, width: size.w });
      cursorY += childH + branchGapY;
    }
  };

  // Place Right Radiating Branches
  let rightCursorY = centerY - rightTotalH / 2;
  rightBranches.forEach((branch, idx) => {
    const accent = BRANCH_ACCENTS[idx % BRANCH_ACCENTS.length];
    const h = measureSubtreeHeight(branch);
    placeSubtree(branch, 1, 'right', rightCursorY, accent, {
      x: centerX,
      y: centerY,
      width: rootSize.w,
    });
    rightCursorY += h + branchGapY;
  });

  // Place Left Radiating Branches
  let leftCursorY = centerY - leftTotalH / 2;
  leftBranches.forEach((branch, idx) => {
    const accent = BRANCH_ACCENTS[(splitIdx + idx) % BRANCH_ACCENTS.length];
    const h = measureSubtreeHeight(branch);
    placeSubtree(branch, 1, 'left', leftCursorY, accent, {
      x: centerX,
      y: centerY,
      width: rootSize.w,
    });
    leftCursorY += h + branchGapY;
  });

  return { nodes, width, height, centerX, centerY };
}

export const MindmapWorkspace: React.FC<MindmapWorkspaceProps> = ({
  lesson,
  onJumpToSection,
  onUpdateMindmap,
  focusNodeId,
  onClearFocusNode,
  onOpenImportModal,
  onOpenResources,
}) => {
  const [viewType, setViewType] = useState<'tree' | 'graph'>('tree');
  const [treeExpandedIds, setTreeExpandedIds] = useState<Set<string>>(
    () => new Set(collectAllIds(lesson.mindmap))
  );
  const [graphExpandedIds, setGraphExpandedIds] = useState<Set<string>>(
    () => new Set(collectDefaultGraphExpandedIds(lesson.mindmap))
  );
  const [selectedNode, setSelectedNode] = useState<MindmapNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Node Edit / Add Child / Delete Confirmation Modal state (no side inspector panel)
  const [nodeEditor, setNodeEditor] = useState<{
    mode: 'edit' | 'add-child';
    targetNodeId: string;
    targetTitle: string;
    title: string;
    subtitle: string;
    summary: string;
    formula: string;
  } | null>(null);
  const [confirmDeleteNodeId, setConfirmDeleteNodeId] = useState<string | null>(null);

  const panStartRef = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setTreeExpandedIds(new Set(collectAllIds(lesson.mindmap)));
    setGraphExpandedIds(new Set(collectDefaultGraphExpandedIds(lesson.mindmap)));
    setSelectedNode((prev) => (prev ? findNodeById(lesson.mindmap, prev.id) : null));
    setConfirmDeleteNodeId(null);
  }, [lesson.id, lesson.mindmap]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [lesson.id]);

  // Direct jump to a specific concept node from Global Search
  useEffect(() => {
    if (!focusNodeId) return;
    const match = findNodeById(lesson.mindmap, focusNodeId);
    if (match) {
      const all = new Set(collectAllIds(lesson.mindmap));
      setTreeExpandedIds(all);
      setGraphExpandedIds(all);
      setSelectedNode(match);
    }
    onClearFocusNode?.();
  }, [focusNodeId, lesson.id, lesson.mindmap, onClearFocusNode]);

  const allIds = useMemo(() => collectAllIds(lesson.mindmap), [lesson.mindmap]);
  const graphLayout = useMemo(
    () => computeCenteredGraphLayout(lesson.mindmap, graphExpandedIds),
    [lesson.mindmap, graphExpandedIds]
  );

  const toggleTreeExpand = (id: string) => {
    setTreeExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGraphExpand = (id: string) => {
    setGraphExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (viewType === 'tree') {
      setTreeExpandedIds(new Set(allIds));
    } else {
      setGraphExpandedIds(new Set(allIds));
    }
  };

  const collapseAll = () => {
    if (viewType === 'tree') {
      setTreeExpandedIds(new Set([lesson.mindmap.id]));
    } else {
      setGraphExpandedIds(new Set([lesson.mindmap.id]));
      setPan({ x: 0, y: 0 });
    }
  };

  const resetGraphView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-graph-interactive="true"]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (Math.hypot(dx, dy) > 4) {
      panStartRef.current.moved = true;
    }
    setPan({
      x: panStartRef.current.originX + dx,
      y: panStartRef.current.originY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const wasClickOnEmptyCanvas = Boolean(panStartRef.current && !panStartRef.current.moved);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if already released
    }
    setIsPanning(false);
    panStartRef.current = null;
    if (wasClickOnEmptyCanvas) {
      setSelectedNode(null);
      setConfirmDeleteNodeId(null);
    }
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.max(0.55, Math.min(1.8, +(z + delta).toFixed(2))));
  };

  const openEditNode = (node: MindmapNode) => {
    setConfirmDeleteNodeId(null);
    setNodeEditor({
      mode: 'edit',
      targetNodeId: node.id,
      targetTitle: node.title,
      title: node.title,
      subtitle: node.subtitle ?? '',
      summary: node.summary ?? '',
      formula: node.formula ?? '',
    });
  };

  const openAddChildNode = (parent: MindmapNode) => {
    setConfirmDeleteNodeId(null);
    setNodeEditor({
      mode: 'add-child',
      targetNodeId: parent.id,
      targetTitle: parent.title,
      title: '',
      subtitle: '',
      summary: '',
      formula: '',
    });
  };

  const handleSubmitNodeEditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeEditor || !onUpdateMindmap || !nodeEditor.title.trim()) return;

    if (nodeEditor.mode === 'edit') {
      const nextRoot = updateNodeInTree(lesson.mindmap, nodeEditor.targetNodeId, {
        title: nodeEditor.title.trim(),
        subtitle: nodeEditor.subtitle.trim() || undefined,
        summary: nodeEditor.summary.trim() || undefined,
        formula: nodeEditor.formula.trim() || undefined,
      });
      onUpdateMindmap(nextRoot);
    } else {
      const childId = `mm-node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const newChild: MindmapNode = {
        id: childId,
        title: nodeEditor.title.trim(),
        subtitle: nodeEditor.subtitle.trim() || undefined,
        summary: nodeEditor.summary.trim(),
        formula: nodeEditor.formula.trim() || undefined,
      };
      const nextRoot = addChildToTree(lesson.mindmap, nodeEditor.targetNodeId, newChild);
      onUpdateMindmap(nextRoot);
      setTreeExpandedIds((prev) => new Set([...prev, nodeEditor.targetNodeId, childId]));
      setGraphExpandedIds((prev) => new Set([...prev, nodeEditor.targetNodeId, childId]));
      setSelectedNode(newChild);
    }

    setNodeEditor(null);
  };

  const handleConfirmDeleteNode = (nodeId: string) => {
    if (!onUpdateMindmap || nodeId === lesson.mindmap.id) return;
    const nextRoot = deleteNodeFromTree(lesson.mindmap, nodeId);
    onUpdateMindmap(nextRoot);
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
    setConfirmDeleteNodeId(null);
  };

  const renderTreeNode = (node: MindmapNode, depth = 0) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = treeExpandedIds.has(node.id);
    const isSelected = selectedNode?.id === node.id;
    const isRoot = depth === 0;
    const subCount = countDescendants(node);
    const isConfirmingDelete = confirmDeleteNodeId === node.id;

    return (
      <div
        key={node.id}
        className={
          depth > 0
            ? 'mr-5 border-r border-[#CBD5E1] pr-4 dark:border-[#364554] sm:mr-7 sm:pr-5'
            : ''
        }
      >
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
                <RichMathText text={node.title} />
              </span>
              {node.subtitle && (
                <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  · <RichMathText text={node.subtitle} />
                </span>
              )}
              {node.formula && (
                <span className="rounded bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-medium text-[#0F766E] dark:bg-[#0F2928] dark:text-[#2DD4BF]">
                  <FormulaDisplay formula={node.formula} inline />
                </span>
              )}
            </div>
            {node.summary && (
              <p className="mt-1 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
                <RichMathText text={node.summary} />
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {onUpdateMindmap && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAddChildNode(node);
                  }}
                  title="افزودن زیرشاخه جدید"
                  aria-label="افزودن زیرشاخه جدید"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#F0FDFA] hover:text-[#0F766E] dark:text-[#94A3B8] dark:hover:bg-[#0F2928] dark:hover:text-[#2DD4BF]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditNode(node);
                  }}
                  title="ویرایش این گره"
                  aria-label="ویرایش این گره"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#27323E] dark:hover:text-[#F8FAFC]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {!isRoot && !isConfirmingDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteNodeId(node.id);
                    }}
                    title="حذف این شاخه"
                    aria-label="حذف این شاخه"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626] dark:text-[#94A3B8] dark:hover:bg-[#7F1D1D]/30 dark:hover:text-[#F87171]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {!isRoot && isConfirmingDelete && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-2 py-0.5 text-[11px] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/35"
                  >
                    <button
                      type="button"
                      onClick={() => handleConfirmDeleteNode(node.id)}
                      className="font-semibold text-[#DC2626] hover:underline dark:text-[#FCA5A5]"
                    >
                      حذف
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteNodeId(null)}
                      className="text-[#64748B] dark:text-[#CBD5E1]"
                    >
                      لغو
                    </button>
                  </div>
                )}
              </div>
            )}

            {node.sectionId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpToSection(node.sectionId!);
                }}
                title="مطالعه بخش مرتبط در جزوه"
                aria-label="مطالعه بخش مرتبط در جزوه"
                className="flex h-7 items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#FAF9F6] px-2 text-[11px] font-medium text-[#475569] transition-colors hover:border-[#0D9488] hover:text-[#0F766E] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
              >
                <BookOpen className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">جزوه</span>
              </button>
            )}

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
                  toggleTreeExpand(node.id);
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
            مایندمپی برای «{lesson.title}» ثبت نشده است
          </h2>
          <p className="mt-2 text-xs leading-6 text-[#64748B] dark:text-[#94A3B8]">
            برای مشاهده مایندمپ و نقشه مفهومی، فایل JSON مایندمپ این درس را بارگذاری کنید.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>ورود فایل مایندمپ (.json)</span>
              </button>
            )}
            {onUpdateMindmap && (
              <button
                type="button"
                onClick={() => {
                  onUpdateMindmap({
                    id: `mm-root-${lesson.id}-${Date.now().toString(36).slice(-4)}`,
                    title: lesson.title,
                    summary: '',
                    children: [],
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0D9488]/40 bg-[#F0FDFA] px-4 py-2 text-xs font-semibold text-[#0F766E] transition-colors hover:border-[#0D9488] dark:border-[#14B8A6]/40 dark:bg-[#0F2928] dark:text-[#2DD4BF]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>ساخت دستی مایندمپ</span>
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
            <span>مایندمپ و نقشه مفهومی فصل {lesson.chapterNumber}</span>
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

          <div className="flex items-center gap-1.5">
            <HoverTooltip label="باز کردن همه شاخه‌ها" placement="bottom" align="center">
              <button
                type="button"
                onClick={expandAll}
                aria-label="باز کردن همه شاخه‌ها"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </HoverTooltip>
            <HoverTooltip label="بستن همه شاخه‌ها" placement="bottom" align="center">
              <button
                type="button"
                onClick={collapseAll}
                aria-label="بستن همه شاخه‌ها"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:border-[#0D9488] hover:text-[#0D9488] dark:border-[#364554] dark:bg-[#1C252E] dark:text-[#CBD5E1] dark:hover:border-[#2DD4BF] dark:hover:text-[#2DD4BF]"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </HoverTooltip>
          </div>

          {viewType === 'graph' && (
            <div className="flex items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white p-1 dark:border-[#364554] dark:bg-[#1C252E]">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
                aria-label="بزرگ‌نمایی"
                className="flex h-8 w-8 items-center justify-center rounded text-[#475569] hover:bg-[#F1F5F9] dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <span className="ltr-inline min-w-[44px] text-center font-mono text-xs font-medium text-[#334155] tabular-nums dark:text-[#CBD5E1]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.55, +(z - 0.15).toFixed(2)))}
                aria-label="کوچک‌نمایی"
                className="flex h-8 w-8 items-center justify-center rounded text-[#475569] hover:bg-[#F1F5F9] dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={resetGraphView}
                title="مرکزچینی و بازنشانی مقیاس"
                aria-label="مرکزچینی و بازنشانی مقیاس"
                className="flex h-8 w-8 items-center justify-center rounded text-[#475569] hover:bg-[#F1F5F9] dark:text-[#CBD5E1] dark:hover:bg-[#27323E]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full-Width Interactive Mindmap Canvas (No Side Inspector Panel) */}
      <div className="elevation-tier-1 rounded-2xl bg-[#FAF9F6] p-4 dark:bg-[#161D24] sm:p-5">
        {viewType === 'tree' ? (
          <div>{renderTreeNode(lesson.mindmap, 0)}</div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              <span className="flex items-center gap-1.5">
                <Move className="h-3.5 w-3.5 text-[#0D9488]" />
                <span>برای جابه‌جایی صفحه بکشید · روی دکمه + / − هر گره برای باز یا بسته کردن شاخه کلیک کنید</span>
              </span>
              <span className="ltr-inline hidden font-mono text-[10px] sm:inline">
                Ctrl + Scroll to Zoom
              </span>
            </div>

            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheelZoom}
              className={`relative h-[620px] w-full select-none overflow-hidden rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] dark:border-[#27323E] dark:bg-[#0F1419] ${
                isPanning ? 'cursor-grabbing' : 'cursor-grab'
              }`}
                style={{
                  backgroundImage:
                    'radial-gradient(rgba(148, 163, 184, 0.28) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                  touchAction: 'none',
                }}
              >
                {/* Compact Floating Node Actions for Selected Graph Node (Icon-Only) */}
                {onUpdateMindmap && selectedNode && (
                  <div
                    data-graph-interactive="true"
                    className="elevation-tier-2 absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1 rounded-xl border border-[#E2E8F0] bg-white/95 px-2.5 py-1.5 text-xs backdrop-blur-sm dark:border-[#364554] dark:bg-[#1C252E]/95"
                  >
                    <span className="max-w-[160px] truncate pl-1 font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                      {selectedNode.title}
                    </span>
                    <span className="h-3.5 w-px bg-[#E2E8F0] dark:bg-[#27323E]" />
                    <HoverTooltip label="ویرایش گره" placement="bottom" align="center">
                      <button
                        type="button"
                        onClick={() => openEditNode(selectedNode)}
                        aria-label="ویرایش گره"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#334155] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F766E] dark:text-[#CBD5E1] dark:hover:bg-[#27323E] dark:hover:text-[#2DD4BF]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip label="افزودن زیرشاخه" placement="bottom" align="center">
                      <button
                        type="button"
                        onClick={() => openAddChildNode(selectedNode)}
                        aria-label="افزودن زیرشاخه"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#0F766E] transition-colors hover:bg-[#F0FDFA] dark:text-[#2DD4BF] dark:hover:bg-[#0F2928]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </HoverTooltip>
                    {selectedNode.id !== lesson.mindmap.id &&
                      (confirmDeleteNodeId === selectedNode.id ? (
                        <div className="flex items-center gap-1 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-2 py-0.5 text-[11px] dark:border-[#B91C1C]/60 dark:bg-[#7F1D1D]/35">
                          <button
                            type="button"
                            onClick={() => handleConfirmDeleteNode(selectedNode.id)}
                            className="font-semibold text-[#DC2626] dark:text-[#FCA5A5]"
                          >
                            حذف قطعی
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteNodeId(null)}
                            className="text-[#64748B] dark:text-[#CBD5E1]"
                          >
                            لغو
                          </button>
                        </div>
                      ) : (
                        <HoverTooltip label="حذف شاخه" placement="bottom" align="end">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteNodeId(selectedNode.id)}
                            aria-label="حذف شاخه"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-[#DC2626] transition-colors hover:bg-[#FEF2F2] dark:text-[#F87171] dark:hover:bg-[#7F1D1D]/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </HoverTooltip>
                      ))}
                  </div>
                )}

                <div
                  className="flex h-full w-full items-center justify-center"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: isPanning ? 'none' : 'transform 140ms ease-out',
                  }}
                >
                  <svg
                    viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}
                    width={graphLayout.width}
                    height={graphLayout.height}
                    className="max-h-none max-w-none overflow-visible"
                    role="img"
                    aria-label={`نقشه مفهومی مرکزی ${lesson.title}`}
                  >
                    {/* Bidirectional Cubic Bezier Connectors */}
                    {graphLayout.nodes
                      .filter(
                        (item) =>
                          item.parentX !== undefined &&
                          item.parentY !== undefined &&
                          item.parentWidth !== undefined
                      )
                      .map((item) => {
                        const dir = item.side === 'right' ? 1 : -1;
                        const startX = item.parentX! + dir * (item.parentWidth! / 2);
                        const startY = item.parentY!;
                        const endX = item.x - dir * (item.width / 2);
                        const endY = item.y;
                        const ctrlOffset = Math.abs(endX - startX) * 0.52;
                        const isActiveEdge = selectedNode?.id === item.node.id;

                        return (
                          <path
                            key={`edge-${item.node.id}`}
                            d={`M ${startX} ${startY} C ${startX + dir * ctrlOffset} ${startY}, ${endX - dir * ctrlOffset} ${endY}, ${endX} ${endY}`}
                            fill="none"
                            stroke={isActiveEdge ? item.accent : item.accent}
                            strokeOpacity={isActiveEdge ? 0.95 : 0.42}
                            strokeWidth={isActiveEdge ? 2.6 : 1.7}
                          />
                        );
                      })}

                    {/* Concept Nodes with Interactive +/- Expand Toggles */}
                    {graphLayout.nodes.map((item) => {
                      const isSelected = selectedNode?.id === item.node.id;
                      const isRoot = item.depth === 0;
                      const rx = item.x - item.width / 2;
                      const ry = item.y - item.height / 2;

                      // Place +/- toggle cleanly on the outward-facing edge
                      const toggleCx = isRoot
                        ? item.x
                        : item.side === 'right'
                        ? rx + item.width + 13
                        : rx - 13;
                      const toggleCy = isRoot ? ry + item.height + 13 : item.y;

                      return (
                        <g key={item.node.id}>
                          {/* Main Node Card */}
                          <g
                            data-graph-interactive="true"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedNode(item.node);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (item.hasChildren) toggleGraphExpand(item.node.id);
                            }}
                            className="cursor-pointer"
                          >
                            <rect
                              x={rx}
                              y={ry}
                              width={item.width}
                              height={item.height}
                              rx={isRoot ? 14 : 11}
                              className={
                                isSelected
                                  ? 'fill-[#0D9488] dark:fill-[#0F766E]'
                                  : isRoot
                                  ? 'fill-[#F0FDFA] dark:fill-[#0F2928]'
                                  : 'fill-white dark:fill-[#1C252E]'
                              }
                              stroke={isSelected ? '#0F766E' : item.accent}
                              strokeOpacity={isSelected || isRoot ? 1 : 0.65}
                              strokeWidth={isSelected ? 2.4 : isRoot ? 2 : 1.35}
                            />

                            {/* Accent Side Strip for non-root cards */}
                            {!isRoot && !isSelected && (
                              <rect
                                x={item.side === 'right' ? rx : rx + item.width - 4}
                                y={ry + 6}
                                width={4}
                                height={item.height - 12}
                                rx={2}
                                fill={item.accent}
                              />
                            )}

                            <text
                              x={item.x}
                              y={item.node.formula ? item.y - 6 : item.y + 4}
                              textAnchor="middle"
                              fontSize={isRoot ? 13 : 11.5}
                              fontWeight={isRoot || isSelected ? 700 : 600}
                              className={
                                isSelected
                                  ? 'fill-white'
                                  : 'fill-[#0F172A] dark:fill-[#F1F5F9]'
                              }
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
                                className={
                                  isSelected
                                    ? 'fill-[#CCFBF1]'
                                    : 'fill-[#0F766E] dark:fill-[#2DD4BF]'
                                }
                                style={{ fontFamily: 'IBM Plex Mono, monospace' }}
                              >
                                {item.node.formula.length > 22
                                  ? `${item.node.formula.slice(0, 21)}…`
                                  : item.node.formula}
                              </text>
                            )}
                          </g>

                          {/* Direct Expand / Collapse Toggle Button (+/-) */}
                          {item.hasChildren && (
                            <g
                              data-graph-interactive="true"
                              role="button"
                              aria-label={item.isExpanded ? 'بستن زیرشاخه‌ها' : 'باز کردن زیرشاخه‌ها'}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGraphExpand(item.node.id);
                              }}
                              className="cursor-pointer"
                            >
                              <circle
                                cx={toggleCx}
                                cy={toggleCy}
                                r={10}
                                className={
                                  item.isExpanded
                                    ? 'fill-white dark:fill-[#1C252E]'
                                    : 'fill-[#0D9488] dark:fill-[#14B8A6]'
                                }
                                stroke={item.accent}
                                strokeWidth={1.6}
                              />
                              <text
                                x={toggleCx}
                                y={toggleCy + 4}
                                textAnchor="middle"
                                fontSize={13}
                                fontWeight={700}
                                className={
                                  item.isExpanded
                                    ? 'fill-[#334155] dark:fill-[#E2E8F0]'
                                    : 'fill-white dark:fill-[#0F1419]'
                                }
                                style={{ fontFamily: 'IBM Plex Mono, monospace' }}
                              >
                                {item.isExpanded ? '−' : '+'}
                              </text>

                              {/* Collapsed descendant count pill */}
                              {!item.isExpanded && item.descendantCount > 0 && (
                                <text
                                  x={
                                    isRoot
                                      ? toggleCx + 20
                                      : item.side === 'right'
                                      ? toggleCx + 18
                                      : toggleCx - 18
                                  }
                                  y={toggleCy + 3.5}
                                  textAnchor="middle"
                                  fontSize={10}
                                  fontWeight={600}
                                  className="fill-[#64748B] dark:fill-[#94A3B8]"
                                  style={{ fontFamily: 'IBM Plex Mono, monospace' }}
                                >
                                  ({item.descendantCount})
                                </text>
                              )}
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Clean Modal for Editing or Adding a Mindmap Node */}
      {nodeEditor && onUpdateMindmap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[2px]"
            onClick={() => setNodeEditor(null)}
          />
          <form
            onSubmit={handleSubmitNodeEditor}
            role="dialog"
            aria-modal="true"
            aria-label={nodeEditor.mode === 'edit' ? 'ویرایش گره مایندمپ' : 'افزودن زیرشاخه جدید'}
            className="elevation-tier-3 relative z-10 w-full max-w-[460px] rounded-2xl border border-[#E2E8F0] bg-white p-5 dark:border-[#364554] dark:bg-[#1C252E]"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                  {nodeEditor.mode === 'edit' ? 'ویرایش گره مایندمپ' : 'افزودن زیرشاخه جدید'}
                </h3>
                {nodeEditor.mode === 'add-child' && (
                  <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    زیرمجموعه گره «{nodeEditor.targetTitle}»
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setNodeEditor(null)}
                aria-label="بستن"
                className="rounded-md p-1 text-[#64748B] hover:bg-[#F1F5F9] dark:hover:bg-[#27323E]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  عنوان مفهوم *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={nodeEditor.title}
                  onChange={(e) =>
                    setNodeEditor((prev) => (prev ? { ...prev, title: e.target.value } : null))
                  }
                  placeholder="مثلاً: واکنش‌های اکسایش-کاهش"
                  className="archival-input w-full border border-[#CBD5E1] bg-white text-sm text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  زیرعنوان کوتاه (اختیاری)
                </label>
                <input
                  type="text"
                  value={nodeEditor.subtitle}
                  onChange={(e) =>
                    setNodeEditor((prev) => (prev ? { ...prev, subtitle: e.target.value } : null))
                  }
                  className="archival-input w-full border border-[#CBD5E1] bg-white text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  فرمول اختیاری (چپ‌چین LTR)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={nodeEditor.formula}
                  onChange={(e) =>
                    setNodeEditor((prev) => (prev ? { ...prev, formula: e.target.value } : null))
                  }
                  placeholder="E = mc^2"
                  className="archival-input w-full border border-[#CBD5E1] bg-white font-mono text-xs text-[#0F172A] dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#334155] dark:text-[#CBD5E1]">
                  توضیح خلاصه (اختیاری)
                </label>
                <textarea
                  rows={3}
                  value={nodeEditor.summary}
                  onChange={(e) =>
                    setNodeEditor((prev) => (prev ? { ...prev, summary: e.target.value } : null))
                  }
                  className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs leading-6 text-[#0F172A] focus:border-[#0D9488] focus:outline-none dark:border-[#364554] dark:bg-[#161D24] dark:text-[#F1F5F9]"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNodeEditor(null)}
                className="rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] dark:border-[#364554] dark:text-[#CBD5E1]"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0F766E]"
              >
                {nodeEditor.mode === 'edit' ? 'ذخیره تغییرات' : 'افزودن زیرشاخه'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
