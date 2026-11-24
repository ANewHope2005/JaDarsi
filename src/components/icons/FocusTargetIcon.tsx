import React from 'react';

interface FocusTargetIconProps {
  className?: string;
}

/**
 * Circular target/reticle with a centered checkmark for Focus Mode.
 * Uses currentColor so stroke adapts cleanly across Light, Dark, Eye Comfort, Sage, and Warm Midnight themes.
 */
export const FocusTargetIcon: React.FC<FocusTargetIconProps> = ({ className = 'h-4 w-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 2.25v3" />
    <path d="M12 18.75v3" />
    <path d="M2.25 12h3" />
    <path d="M18.75 12h3" />
    <path d="M9.1 12.2l1.95 1.95 3.95-4.2" />
  </svg>
);
