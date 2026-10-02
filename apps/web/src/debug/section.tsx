/**
 * One folding section inside a tab. It holds what is wanted now and then, such
 * as the sliders, so the rows used all the time stay at the top of the tab.
 */
import type { ReactNode } from 'react';

/** What a section needs. */
interface SectionProps {
  /** The heading. */
  title: string;
  /** What it holds. */
  children: ReactNode;
}

/**
 * A section that starts folded.
 *
 * @param props - The heading and the contents.
 * @returns A `details` element, so folding needs no script and works by keyboard.
 */
export function Section({ title, children }: SectionProps) {
  return (
    <details className="m8-section">
      <summary>{title}</summary>
      {children}
    </details>
  );
}
