import React from 'react';

interface HoverTooltipProps {
  label: string;
  placement?: 'top' | 'bottom';
  align?: 'center' | 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

/**
 * Lightweight, theme-adaptive RTL hover & keyboard-focus tooltip for icon-only controls.
 * In RTL layouts, `start` aligns to the right edge and `end` aligns to the left edge.
 */
export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  label,
  placement = 'bottom',
  align = 'center',
  className = '',
  children,
}) => {
  const verticalClass =
    placement === 'top'
      ? 'bottom-full mb-2 translate-y-1 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0'
      : 'top-full mt-2 -translate-y-1 group-hover/tip:translate-y-0 group-focus-within/tip:translate-y-0';

  const horizontalClass =
    align === 'start'
      ? 'right-0'
      : align === 'end'
      ? 'left-0'
      : 'left-1/2 -translate-x-1/2';

  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-white/10 bg-[#1E293B] px-2.5 py-1 text-[11px] font-medium leading-4 text-[#F8FAFC] opacity-0 shadow-md transition-all duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 dark:border-black/15 dark:bg-[#F1F5F9] dark:text-[#0F172A] no-print ${verticalClass} ${horizontalClass}`}
      >
        {label}
      </span>
    </span>
  );
};
