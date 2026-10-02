/** The usage report for the range the person picked, read from the server. */
import type { UsageReport } from '@m8/shared';
import { useEffect, useState } from 'react';
import { readUsage } from './api.ts';
import { rangeStart, type UsageRange } from './days.ts';

/** The report and the way to pick another range. */
export interface Usage {
  /** The report for the range, or null while it is read and after a failure. */
  report: UsageReport | null;
  /** What the server said when the read failed, or null. */
  fault: string | null;
  /** The range picked. */
  range: UsageRange;
  /**
   * Pick another range. The report is read again.
   * @param range - The range.
   */
  setRange: (range: UsageRange) => void;
}

/**
 * Read the report when the caller mounts and each time the range changes. An
 * answer that arrives after another range was picked is dropped.
 *
 * @returns The report, the failure, the range and the way to change it.
 */
export function useUsage(): Usage {
  const [range, setRange] = useState<UsageRange>('week');
  const [report, setReport] = useState<UsageReport | null>(null);
  const [fault, setFault] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setFault(null);
    let current = true;
    readUsage(rangeStart(range, Date.now()))
      .then((read) => {
        if (current) setReport(read);
      })
      .catch((error: unknown) => {
        if (current) setFault(error instanceof Error ? error.message : String(error));
      });
    return () => {
      current = false;
    };
  }, [range]);

  return { report, fault, range, setRange };
}
