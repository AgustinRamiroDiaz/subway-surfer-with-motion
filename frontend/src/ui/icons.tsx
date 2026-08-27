import type { ReactElement } from 'react';

export function BoltIcon(): ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M11 2L4 12h5l-1 6 7-10h-5l1-6z" />
    </svg>
  );
}

export function TargetIcon(): ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10l4 4 8-8" />
    </svg>
  );
}

export function SlidersIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="17" y2="6" /><circle cx="12" cy="6" r="2" />
      <line x1="3" y1="10" x2="17" y2="10" /><circle cx="7" cy="10" r="2" />
      <line x1="3" y1="14" x2="17" y2="14" /><circle cx="14" cy="14" r="2" />
    </svg>
  );
}

export function MenuIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="3" height="12" rx="1" /><rect x="11" y="4" width="3" height="12" rx="1" />
    </svg>
  );
}

export function PlayIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6 4l10 6-10 6z" />
    </svg>
  );
}

export function SwapIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h9M10 4l3 3-3 3" /><path d="M16 13H7M10 16l-3-3 3-3" />
    </svg>
  );
}

export function PowerIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3v7" /><path d="M5.5 5.5a7 7 0 1 0 9 0" />
    </svg>
  );
}

export function PanelToggleIcon(): ReactElement {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4l-6 6 6 6" />
    </svg>
  );
}
