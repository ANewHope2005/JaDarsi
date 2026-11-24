import React from 'react';

interface FlashcardIconProps {
  className?: string;
}

/**
 * Distinct study flashcard icon: a front index/study card with prompt lines
 * backed by a slightly tilted secondary card peeking behind.
 */
export const FlashcardIcon: React.FC<FlashcardIconProps> = ({ className = 'h-4 w-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Slightly tilted back study card */}
    <path d="M5.8 8 6.4 5.6a2 2 0 0 1 2.4-1.4l11 2.9a2 2 0 0 1 1.4 2.4l-1.6 6.1a1.4 1.4 0 0 1-.6.8" />
    {/* Front index / flashcard */}
    <rect x="2.75" y="8" width="16.25" height="12" rx="2.25" />
    {/* Prompt & text lines on the front card */}
    <path d="M6.25 12.25h6" />
    <path d="M6.25 15.75h8.75" />
    <circle cx="15.35" cy="12.25" r="0.85" fill="currentColor" stroke="none" />
  </svg>
);
